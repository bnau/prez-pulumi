import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {dbName, dbPassword, dbUser, Stack} from "./common";
import * as pulumi from "@pulumi/pulumi";
import {Output} from "@pulumi/pulumi";
import * as path from "node:path";


export class RemoteStack extends Stack {
    private vpc = new awsx.ec2.DefaultVpc("default", {})
    application(dbHost: string): Output<string> {
        const ecrRepository = new awsx.ecr.Repository("my-repo", {forceDelete: true});

        const image = ecrRepository.url.apply(url => {
            return new awsx.ecr.Image("my-image", {
                context: path.join(__dirname, "backend"),
                repositoryUrl: url,
            });
        })

        const cluster = new aws.ecs.Cluster("backend-cluster");

        const feSecurityGroup = new aws.ec2.SecurityGroup("fargate-sg", {
            vpcId: this.vpc.vpcId,
            description: "Allows all HTTP(s) traffic.",
            ingress: [
                {
                    cidrBlocks: ["0.0.0.0/0"],
                    fromPort: 443,
                    toPort: 443,
                    protocol: "tcp",
                    description: "Allow https",
                },
                {
                    cidrBlocks: ["0.0.0.0/0"],
                    fromPort: 80,
                    toPort: 80,
                    protocol: "tcp",
                    description: "Allow http",
                },
                {
                    cidrBlocks: ["0.0.0.0/0"],
                    fromPort: 8080,
                    toPort: 8080,
                    protocol: "tcp",
                    description: "Allow http",
                },
            ],
            egress: [
                {
                    protocol: "-1",
                    fromPort: 0,
                    toPort: 0,
                    cidrBlocks: ["0.0.0.0/0"],
                },
            ],
        });

        const alb = new aws.lb.LoadBalancer(`app-alb`, {
            securityGroups: [feSecurityGroup.id],
            subnets: this.vpc.publicSubnetIds,
        });

        const atg = new aws.lb.TargetGroup(`app-app-tg`, {
            port: 80,
            protocol: "HTTP",
            targetType: "ip",
            vpcId: this.vpc.vpcId,
            healthCheck: {
                healthyThreshold: 2,
                interval: 5,
                timeout: 4,
                protocol: "HTTP",
                matcher: "200-399",
            },
        });

        new aws.lb.Listener(`app-listener`, {
            loadBalancerArn: alb.arn,
            port: 80,
            defaultActions: [
                {
                    type: "forward",
                    targetGroupArn: atg.arn,
                },
            ],
        });

        const assumeRolePolicy = {
            "Version": "2008-10-17",
            "Statement": [{
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                    "Service": "ecs-tasks.amazonaws.com",
                },
                "Action": "sts:AssumeRole",
            }],
        };

        const role = new aws.iam.Role(`app-task-role`, {
            assumeRolePolicy: JSON.stringify(assumeRolePolicy),
        });

        new aws.iam.RolePolicyAttachment(`app-task-policy`, {
            role: role.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        });

        const taskDefinition = new aws.ecs.TaskDefinition(`app-task`, {
            family: "fargate-task-definition",
            cpu: "256",
            memory: "512",
            networkMode: "awsvpc",
            requiresCompatibilities: ["FARGATE"],
            executionRoleArn: role.arn,
            containerDefinitions: pulumi.jsonStringify([{
                "name": "app",
                "image": image.imageUri,
                "portMappings": [{
                    "containerPort": 80,
                    "hostPort": 80,
                    "protocol": "tcp",
                },{
                    "containerPort": 8080,
                    "hostPort": 8080,
                    "protocol": "tcp",
                }],
                "environment": [
                                {name: "DB_HOST", value: dbHost},
                                {name: "DB_USER", value: dbUser},
                                {name: "DB_PASSWORD", value: dbPassword},
                                {name: "DB_NAME", value: dbName},
                ],
            }]),
        });

        new aws.ecs.Service("app-service", {
            cluster: cluster.arn,
            desiredCount: 1,
            launchType: "FARGATE",
            taskDefinition: taskDefinition.arn,
            networkConfiguration: {
                assignPublicIp: true,
                subnets: this.vpc.publicSubnetIds,
                securityGroups: [feSecurityGroup.id],
            },
            loadBalancers: [{
                targetGroupArn: atg.arn,
                containerName: "app",
                containerPort: 8080,
            }],
        }, {customTimeouts: {create: "5m"}});

       return  pulumi.interpolate `http://${alb.dnsName}`;
    }

    database(): Output<string> {
        const dbSecurityGroup = new aws.ec2.SecurityGroup("db-security-group", {
            vpcId: this.vpc.vpcId,
            ingress: [
                {protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: ["0.0.0.0/0"]},
            ],
        });

        const db = new aws.rds.Instance("backend-db", {
            allocatedStorage: 20,
            engine: "postgres",
            engineVersion: "14",
            instanceClass: "db.t3.micro",
            dbName,
            username: dbUser,
            password: dbPassword,
            vpcSecurityGroupIds: [dbSecurityGroup.id],
            skipFinalSnapshot: true,
            publiclyAccessible: true,
        });

        return db.address;
    }

}

import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {dbName, dbPassword, dbUser, Stack} from "./common";
import * as pulumi from "@pulumi/pulumi";
import {Lifted, Output, OutputInstance} from "@pulumi/pulumi";
import * as path from "node:path";

type EcsApplicationArgs = {
    vpc: awsx.ec2.DefaultVpc;
    dbHost: Output<string>;
}

class EcsApplication extends pulumi.ComponentResource {
    url: Output<string>;

    constructor(name: string, args: EcsApplicationArgs, opts?: pulumi.ComponentResourceOptions) {
        super("my-app:remote:EcsApplication", name, {}, opts);

        const ecrRepository = new awsx.ecr.Repository("my-repo", {forceDelete: true}, {parent: this});

        const image = ecrRepository.url.apply(url => {
            return new awsx.ecr.Image("my-image", {
                context: path.join(__dirname, "backend"),
                repositoryUrl: url,
            }, {parent: this});
        })

        const cluster = new aws.ecs.Cluster("backend-cluster", {}, {parent: this});

        const feSecurityGroup = new aws.ec2.SecurityGroup("fargate-sg", {
            vpcId: args.vpc.vpcId,
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
        }, {parent: this});

        const alb = new aws.lb.LoadBalancer(`app-alb`, {
            securityGroups: [feSecurityGroup.id],
            subnets: args.vpc.publicSubnetIds,
        }, {parent: this});

        const atg = new aws.lb.TargetGroup(`app-app-tg`, {
            port: 80,
            protocol: "HTTP",
            targetType: "ip",
            vpcId: args.vpc.vpcId,
            healthCheck: {
                healthyThreshold: 2,
                interval: 5,
                timeout: 4,
                protocol: "HTTP",
                matcher: "200-399",
            },
        }, {parent: this});

        new aws.lb.Listener(`app-listener`, {
            loadBalancerArn: alb.arn,
            port: 80,
            defaultActions: [
                {
                    type: "forward",
                    targetGroupArn: atg.arn,
                },
            ],
        }, {parent: this});

        const role = new aws.iam.Role(`app-task-role`, {
            assumeRolePolicy: JSON.stringify({
                "Version": "2008-10-17",
                "Statement": [{
                    "Sid": "",
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "ecs-tasks.amazonaws.com",
                    },
                    "Action": "sts:AssumeRole",
                }],
            }),
        }, {parent: this});

        new aws.iam.RolePolicyAttachment(`app-task-policy`, {
            role: role.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        }, {parent: this});

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
                }, {
                    "containerPort": 8080,
                    "hostPort": 8080,
                    "protocol": "tcp",
                }],
                "environment": [
                    {name: "DB_HOST", value: args.dbHost},
                    {name: "DB_USER", value: dbUser},
                    {name: "DB_PASSWORD", value: dbPassword},
                    {name: "DB_NAME", value: dbName},
                ],
            }]),
        }, {parent: this});

        new aws.ecs.Service("app-service", {
            cluster: cluster.arn,
            desiredCount: 1,
            launchType: "FARGATE",
            taskDefinition: taskDefinition.arn,
            networkConfiguration: {
                assignPublicIp: true,
                subnets: args.vpc.publicSubnetIds || [],
                securityGroups: [feSecurityGroup.id],
            },
            loadBalancers: [{
                targetGroupArn: atg.arn,
                containerName: "app",
                containerPort: 8080,
            }],
        }, {customTimeouts: {create: "5m"}, parent: this});

        this.url = pulumi.interpolate`http://${alb.dnsName}`;

        this.registerOutputs({url: this.url});
    }
}

type RdsDatabaseArg = {
    vpc: awsx.ec2.DefaultVpc;
}

class RdsDatabase extends pulumi.ComponentResource {
    host: Output<string>;

    constructor(name: string, args: RdsDatabaseArg, opts?: pulumi.ComponentResourceOptions) {
        super("my-app:remote:RdsDatabase", name, {}, opts);

        const dbSecurityGroup = new aws.ec2.SecurityGroup("db-security-group", {
            vpcId: args.vpc.vpcId,
            ingress: [
                {protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: ["0.0.0.0/0"]},
            ],
        }, {parent: this});

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
        }, {parent: this});

        this.host = db.address;

        this.registerOutputs({host: this.host});
    }
}

const vpc = new awsx.ec2.DefaultVpc("default", {});
export class RemoteStack extends Stack {
    constructor(name: string) {
        super("my-app:remote:Stack", name);
    }

    application(dbHost: OutputInstance<string> & Lifted<string>): Output<string> {
        return new EcsApplication("my-app", {vpc, dbHost}, {parent: this}).url;
    }

    database(): Output<string> {
        return new RdsDatabase("my-db", {vpc}, {parent: this}).host;
    }

}

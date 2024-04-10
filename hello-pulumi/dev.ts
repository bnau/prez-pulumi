import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import {Stack} from "./common";
import {Output} from "@pulumi/pulumi";

const dbUser = "demo-user";
const dbPassword = "my-password";
const dbName = "demo-db"

export class DevStack extends Stack {
    private readonly config: pulumi.Config;
    private readonly k8sNamespace: string;

    private webServerNs: kubernetes.core.v1.Namespace;

    constructor(config: pulumi.Config) {
        super();
        this.config = config;
        this.k8sNamespace = config.get("namespace") || "default";

        this.webServerNs = new kubernetes.core.v1.Namespace("webserver", {
            metadata: {
                name: this.k8sNamespace,
            }
        });
    }

    application(dbHost: string): void {
        const numReplicas = this.config.getNumber("replicas") || 1;
        const appLabels = {
            app: "nginx",
        };
        const image = new docker.Image("my-image", {
            build: {
                context: "../backend",
            },
            imageName: "pulumi-demo",
            skipPush: true,
        });

        new kubernetes.apps.v1.Deployment("webserverdeployment", {
            metadata: {
                namespace: this.webServerNs.metadata.name,
            },
            spec: {
                selector: {
                    matchLabels: appLabels,
                },
                replicas: numReplicas,
                template: {
                    metadata: {
                        labels: appLabels,
                    },
                    spec: {
                        containers: [{
                            image: image.imageName,
                            name: "pulumi-demo",
                            imagePullPolicy: "Never",
                            env: [
                                {
                                    name: "DB_USER",
                                    value: dbUser,
                                },
                                {
                                    name: "DB_PASSWORD",
                                    value: dbPassword,
                                },
                                {
                                    name: "DB_HOST",
                                    value: dbHost,
                                },
                                {
                                    name: "DB_NAME",
                                    value: dbName,
                                },
                            ],
                        }],
                    },
                },
            },
        });

        new kubernetes.core.v1.Service("webserverservice", {
            metadata: {
                namespace: this.webServerNs.metadata.name,
            },
            spec: {
                ports: [{
                    port: 80,
                    targetPort: 80,
                    protocol: "TCP",
                }],
                type: "NodePort",
                selector: appLabels,
            },
        });
    }

    database(): Output<string> {
        const pgChart = new kubernetes.helm.v3.Chart("postgres", {
            namespace: this.k8sNamespace,
            chart: "postgresql",
            fetchOpts: {
                repo: "https://charts.bitnami.com/bitnami",
            },
            values: {
                auth: {
                    username: dbUser,
                    password: dbPassword,
                    postgresPassword: dbPassword,
                    database: dbName,
                }

            },
        });
        return pgChart.getResourceProperty("v1/Service", `${this.k8sNamespace}/postgres-postgresql`, "metadata").name;
    }
}

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import * as docker from "@pulumi/docker";
import {Output} from "@pulumi/pulumi";

// Get some values from the stack configuration, or use defaults
const config = new pulumi.Config();
const k8sNamespace = config.get("namespace") || "default";
const numReplicas = config.getNumber("replicas") || 1;
const appLabels = {
    app: "nginx",
};
const dbUser = "demo-user";
const dbPassword = "my-password";
const dbName = "demo-db"

const webServerNs = new kubernetes.core.v1.Namespace("webserver", {
    metadata: {
        name: k8sNamespace,
    }
});

const database = (): Output<string> => {
    const pgChart = new kubernetes.helm.v3.Chart("postgres", {
        namespace: k8sNamespace,
        chart: "postgresql",
        fetchOpts: {
            repo: "https://charts.bitnami.com/bitnami",
        },
        values: {
            auth: {
                username: dbUser,
                password: dbPassword,
                database: dbName,
            }

        },
    });
    return pgChart.getResourceProperty("v1/Service", `${k8sNamespace}/postgres-postgresql`, "metadata").name;
}

const application = (dbHost: string) => {
    const image = new docker.Image("my-image", {
        build: {
            context: "../backend",
        },
        imageName: "pulumi-demo",
        skipPush: true,
    });

    new kubernetes.apps.v1.Deployment("webserverdeployment", {
        metadata: {
            namespace: webServerNs.metadata.name,
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

// Expose the Deployment as a Kubernetes Service
    new kubernetes.core.v1.Service("webserverservice", {
        metadata: {
            namespace: webServerNs.metadata.name,
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

const dbHost = database();
dbHost.apply(application);

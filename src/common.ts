import {ComponentResource, Lifted, Output, OutputInstance} from "@pulumi/pulumi";

export const dbUser = "demo";
export const dbPassword = "my-password";
export const dbName = "demo"

export abstract class Stack extends ComponentResource {
    url: Output<string>;

    abstract database(): Output<string>;

    abstract application(dbHost: Output<string>): Output<string>;

    constructor(type: string, name: string) {
        super(type, name);

        const dbHost = this.database();
        this.url = this.application(dbHost);

        this.registerOutputs({url: this.url});
    }
}

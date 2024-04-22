import {ComponentResource, Lifted, Output, OutputInstance} from "@pulumi/pulumi";

export const dbUser = "demo";
export const dbPassword = "my-password";
export const dbName = "demo"

export abstract class Stack extends ComponentResource {
    abstract database(): Output<string>;

    abstract application(dbHost: Output<string>): Output<string>;

    constructor(type: string, name: string) {
        super(type, name);
    }

    build(): Output<string> {
        const dbHost = this.database();
        return this.application(dbHost);
    }
}

import {Output} from "@pulumi/pulumi";

export abstract class Stack {
    abstract database(): Output<string>;
    abstract application(dbHost: string): void;

    init(): void {
        const dbHost = this.database();
        dbHost.apply(this.application.bind(this));
    }
}

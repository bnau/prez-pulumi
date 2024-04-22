import * as pulumi from "@pulumi/pulumi";
import {LocalStack} from "./local";
import {Stack} from "./common";
import {RemoteStack} from "./remote";

const config = new pulumi.Config();

let stack: Stack;
if (config.get("env") === "local") {
    stack = new LocalStack("my-stack", config);
} else if (config.get("env") === "remote") {
    stack = new RemoteStack("my-stack");
} else {
    throw new Error(`Unknown stack: ${pulumi.getStack()}`);
}

export const url = stack.build();

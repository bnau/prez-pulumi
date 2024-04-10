import * as pulumi from "@pulumi/pulumi";
import {DevStack} from "./dev";
import {Stack} from "./common";

// Get some values from the stack configuration, or use defaults
const config = new pulumi.Config();

let stack: Stack;
if (pulumi.getStack() === "dev") {
    stack = new DevStack(config);
} else {
    throw new Error("Unknown stack");
}

const outputs = stack.init();

export const url = outputs.url;

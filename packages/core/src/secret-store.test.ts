import { describe, expect, it } from "vitest";
import {
  MacOSKeychainSecretStore,
  MemorySecretStore,
  SecretStoreError,
  type CommandRunner
} from "./secret-store.js";

const TEST_SECRET = "tv_test_secret_value_123456";

class FakeCommandRunner implements CommandRunner {
  public readonly calls: Array<{ command: string; args: string[]; input?: string }> = [];
  public nextExitCode = 0;
  public nextStdout = "";
  public nextStderr = "";

  public async run(command: string, args: string[], input?: string) {
    this.calls.push({ command, args, input });
    return {
      stdout: this.nextStdout,
      stderr: this.nextStderr,
      exitCode: this.nextExitCode
    };
  }
}

describe("MemorySecretStore", () => {
  it("supports create, read, update, delete", async () => {
    const store = new MemorySecretStore();
    const ref = await store.writeSecret({
      profileId: "github:work",
      field: "token",
      value: TEST_SECRET,
      metadata: {
        provider: "github",
        displayName: "GitHub Work"
      }
    });

    await expect(store.readSecret(ref)).resolves.toBe(TEST_SECRET);

    await store.updateSecret(ref, "updated_secret_value_123456");
    await expect(store.readSecret(ref)).resolves.toBe("updated_secret_value_123456");

    await expect(store.deleteSecret(ref)).resolves.toBe(true);
    await expect(store.readSecret(ref)).resolves.toBeNull();
    await expect(store.deleteSecret(ref)).resolves.toBe(false);
  });

  it("lists metadata without secret values", async () => {
    const store = new MemorySecretStore();
    await store.writeSecret({
      profileId: "openai:work",
      field: "api_key",
      value: TEST_SECRET,
      metadata: {
        provider: "openai",
        displayName: "OpenAI Work"
      }
    });

    const refs = await store.listSecretRefs();
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      ref: {
        store: "memory",
        key: "openai:work:api_key",
        profileId: "openai:work",
        field: "api_key"
      },
      metadata: {
        provider: "openai",
        displayName: "OpenAI Work"
      }
    });
    expect(JSON.stringify(refs)).not.toContain(TEST_SECRET);
  });
});

describe("MacOSKeychainSecretStore", () => {
  it("uses security add-generic-password for writes", async () => {
    const runner = new FakeCommandRunner();
    const store = new MacOSKeychainSecretStore({ runner, service: "TokenValveTest" });

    const ref = await store.writeSecret({
      profileId: "github:work",
      field: "token",
      value: TEST_SECRET
    });

    expect(ref).toMatchObject({
      store: "macos-keychain",
      key: "github:work:token"
    });
    expect(runner.calls[0]).toEqual({
      command: "security",
      args: [
        "add-generic-password",
        "-a",
        "github:work:token",
        "-s",
        "TokenValveTest",
        "-w",
        TEST_SECRET,
        "-U"
      ],
      input: undefined
    });
  });

  it("uses security find-generic-password for reads", async () => {
    const runner = new FakeCommandRunner();
    runner.nextStdout = `${TEST_SECRET}\n`;
    const store = new MacOSKeychainSecretStore({ runner, service: "TokenValveTest" });

    await expect(store.readSecret({
      store: "macos-keychain",
      key: "github:work:token",
      profileId: "github:work",
      field: "token"
    })).resolves.toBe(TEST_SECRET);

    expect(runner.calls[0]?.args).toEqual([
      "find-generic-password",
      "-a",
      "github:work:token",
      "-s",
      "TokenValveTest",
      "-w"
    ]);
  });

  it("uses security delete-generic-password for deletes", async () => {
    const runner = new FakeCommandRunner();
    const store = new MacOSKeychainSecretStore({ runner, service: "TokenValveTest" });

    await expect(store.deleteSecret({
      store: "macos-keychain",
      key: "github:work:token",
      profileId: "github:work",
      field: "token"
    })).resolves.toBe(true);

    expect(runner.calls[0]?.args).toEqual([
      "delete-generic-password",
      "-a",
      "github:work:token",
      "-s",
      "TokenValveTest"
    ]);
  });

  it("does not include secret values in command error messages", async () => {
    const runner = new FakeCommandRunner();
    runner.nextExitCode = 1;
    runner.nextStderr = `failed writing ${TEST_SECRET}`;
    const store = new MacOSKeychainSecretStore({ runner, service: "TokenValveTest" });

    await expect(store.writeSecret({
      profileId: "github:work",
      field: "token",
      value: TEST_SECRET
    })).rejects.toThrow(SecretStoreError);

    await store.writeSecret({
      profileId: "github:work",
      field: "token",
      value: TEST_SECRET
    }).catch((error: unknown) => {
      expect(String(error)).not.toContain(TEST_SECRET);
    });
  });
});

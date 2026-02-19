import { describe, it, expect } from "vitest";
import { ALL_SLASH_COMMANDS } from "../components/copilot/SlashCommandPicker";
import { AAS_COMMANDS } from "../components/copilot/aas-commands";
import { DOMAIN_CATALOGUE } from "../lib/se-aas/domain-catalogue";

describe("Domain commands completeness", () => {
  it("should have all 17 SE-aaS domains as slash commands", () => {
    const seaasCommands = ALL_SLASH_COMMANDS.filter((c) => c.service === "seaas");
    expect(seaasCommands.length).toBe(DOMAIN_CATALOGUE.length);

    // Every domain in the catalogue should have a corresponding slash command
    for (const domain of DOMAIN_CATALOGUE) {
      const match = seaasCommands.find((c) => c.id === domain.id);
      expect(match, `Missing slash command for domain: ${domain.id}`).toBeDefined();
    }
  });

  it("should have all 7 AAS commands", () => {
    const aasCommands = ALL_SLASH_COMMANDS.filter((c) => c.service === "aas");
    expect(aasCommands.length).toBe(AAS_COMMANDS.length);
    expect(aasCommands.length).toBe(7);
  });

  it("should have no duplicate IDs", () => {
    const ids = ALL_SLASH_COMMANDS.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have non-empty prompts for all commands", () => {
    for (const cmd of ALL_SLASH_COMMANDS) {
      expect(cmd.prompt, `Empty prompt for command: ${cmd.id}`).toBeTruthy();
      expect(cmd.prompt.length, `Short prompt for command: ${cmd.id}`).toBeGreaterThan(5);
    }
  });

  it("should have non-empty labels and descriptions", () => {
    for (const cmd of ALL_SLASH_COMMANDS) {
      expect(cmd.label, `Empty label for command: ${cmd.id}`).toBeTruthy();
      expect(cmd.description, `Empty description for command: ${cmd.id}`).toBeTruthy();
    }
  });

  it("should have valid service types", () => {
    for (const cmd of ALL_SLASH_COMMANDS) {
      expect(["general", "aas", "seaas"]).toContain(cmd.service);
    }
  });

  it("should have icons for all commands", () => {
    for (const cmd of ALL_SLASH_COMMANDS) {
      expect(cmd.icon, `Empty icon for command: ${cmd.id}`).toBeTruthy();
    }
  });

  it("should have correct total count (17 SE-aaS + 6 AAS = 23)", () => {
    expect(ALL_SLASH_COMMANDS.length).toBe(DOMAIN_CATALOGUE.length + AAS_COMMANDS.length);
  });
});

import type { EligibilityProfile, GrantEntry, RulesData, Scenario } from '../types/arc';
import { stripCustomLabels } from '../engine/rules';
import { createId } from '../engine/templates';

export interface SharedPlanPayload {
  v: 1;
  rulesVersion: string;
  scenarioName: string;
  grants: GrantEntry[];
  eligibility?: EligibilityProfile;
  strippedTitles: boolean;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compressString(str: string): Promise<{ compressed: boolean; encoded: string }> {
  const rawBytes = new TextEncoder().encode(str);
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([rawBytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const compressedBuf = await new Response(stream).arrayBuffer();
      const compressedBytes = new Uint8Array(compressedBuf);
      if (compressedBytes.length < rawBytes.length) {
        return { compressed: true, encoded: bytesToBase64Url(compressedBytes) };
      }
    } catch {
      // Fall back to plain base64url
    }
  }
  return { compressed: false, encoded: bytesToBase64Url(rawBytes) };
}

async function decompressString(encoded: string, compressed: boolean): Promise<string> {
  const bytes = base64UrlToBytes(encoded);
  if (compressed && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes.buffer as ArrayBuffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const plainBuf = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(plainBuf);
  }
  return new TextDecoder().decode(bytes);
}

export async function createShareUrl(params: {
  scenario: Scenario;
  rules: RulesData;
  eligibility?: EligibilityProfile;
  stripTitles: boolean;
}): Promise<string> {
  const grants = params.stripTitles
    ? stripCustomLabels(params.scenario.grants, params.rules)
    : params.scenario.grants;

  const payload: SharedPlanPayload = {
    v: 1,
    rulesVersion: params.rules.version,
    scenarioName: params.stripTitles ? 'Shared Plan' : params.scenario.name,
    grants,
    eligibility: params.eligibility,
    strippedTitles: params.stripTitles,
  };

  const json = JSON.stringify(payload);
  const { compressed, encoded } = await compressString(json);
  const prefix = compressed ? 'planz=' : 'plan=';
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#${prefix}${encoded}`;
}

export async function decodeShareHash(hash: string): Promise<SharedPlanPayload | null> {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!clean) return null;

  let compressed = false;
  let encoded = '';
  if (clean.startsWith('planz=')) {
    compressed = true;
    encoded = clean.slice('planz='.length);
  } else if (clean.startsWith('plan=')) {
    compressed = false;
    encoded = clean.slice('plan='.length);
  } else {
    return null;
  }

  if (!encoded) return null;

  try {
    const json = await decompressString(encoded, compressed);
    const parsed = JSON.parse(json) as Partial<SharedPlanPayload>;
    if (!parsed || !Array.isArray(parsed.grants)) return null;

    return {
      v: 1,
      rulesVersion: typeof parsed.rulesVersion === 'string' ? parsed.rulesVersion : 'unknown',
      scenarioName: typeof parsed.scenarioName === 'string' ? parsed.scenarioName : 'Shared Plan',
      grants: parsed.grants.map((g) => ({
        ...g,
        id: createId('grant'),
      })),
      eligibility: parsed.eligibility,
      strippedTitles: Boolean(parsed.strippedTitles),
    };
  } catch {
    return null;
  }
}

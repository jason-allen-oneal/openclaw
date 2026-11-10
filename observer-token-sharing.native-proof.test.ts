import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { PROXY_FIXTURE_CERTIFICATE, PROXY_FIXTURE_KEY, withTempDir } from 'openclaw/plugin-sdk/test-env';
import { expect, it, vi } from 'vitest';
import { runCodexIsolatedCompletion } from './isolated-completion.js';
import { isolatedParams } from './isolated-completion.params-test-support.js';
import { createCodexNativeTestState } from './native-app-server.test-support.js';
import * as shared from './shared-client.js';
import * as oauth from './responses-oauth.js';
import { setManagedCodexPluginRoot } from './managed-binary.js';

const transport = vi.hoisted(() => ({ origin: '', requested: [] as string[] }));
vi.unmock('node:child_process');
vi.mock('openclaw/plugin-sdk/ssrf-runtime', async original => {
  const actual = await original<typeof import('openclaw/plugin-sdk/ssrf-runtime')>();
  return {...actual, fetchWithSsrFGuard: (params: Parameters<typeof actual.fetchWithSsrFGuard>[0]) => {
    const source = new URL(params.url);
    expect(source.origin).toBe('https://api.openai.com');
    transport.requested.push(source.href);
    const target = new URL(source.pathname + source.search, transport.origin);
    return actual.fetchWithSsrFGuard({...params, url: target.href,
      policy: {allowedOrigins: [target.origin], hostnameAllowlist: ['127.0.0.1']},
      dispatcherPolicy: {mode: 'direct', connect: {ca: PROXY_FIXTURE_CERTIFICATE}}});
  }};
});
it('passes observer preferred sampling through real native Codex and physical TLS receiver', {timeout: 90_000}, async () => {
  await withTempDir('observer-auth-native-proof-', async root => {
    const native = await createCodexNativeTestState(root);
    setManagedCodexPluginRoot(path.resolve(import.meta.dirname, '../..'));
    vi.stubEnv('HOME', native.env.HOME);
    vi.stubEnv('CODEX_HOME', native.codexHome);
    vi.stubEnv('OPENCLAW_STATE_DIR', path.join(root, 'state'));
    for (const key of ['CODEX_CA_CERTIFICATE','SSL_CERT_FILE','REQUEST_METHOD']) vi.stubEnv(key,undefined);
    for (const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy']) vi.stubEnv(key,native.env[key]);
    const received: unknown[] = [];
    const server = https.createServer({key: PROXY_FIXTURE_KEY, cert: PROXY_FIXTURE_CERTIFICATE}, async (req,res) => {
      const bytes = await buffer(req); const body=JSON.parse(bytes.toString()); received.push(body);
      expect(req.headers.authorization).toBe('Bearer synthetic-plan-access');
      expect(req.url).toBe('/v1/responses');
      const item={type:'message', role:'assistant', id:'answer-1', content:[{type:'output_text',text:'OBSERVER_NATIVE_OK'}]};
      const events=[{type:'response.created',response:{id:'response-1'}},{type:'response.output_item.done',item},{type:'response.completed',response:{id:'response-1',usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}];
      res.writeHead(200, {'content-type':'text/event-stream'});
      res.end(events.map(x=>'data: '+JSON.stringify(x)+'\n\n').join(''));
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening'); const address=server.address(); assert(address&&typeof address!=='string');
    transport.origin=`https://127.0.0.1:${address.port}`;
    const profileId='openai:observer-synthetic';
    const params=isolatedParams({version:1, profiles:{[profileId]:{type:'oauth',provider:'openai',authFlow:'chatgpt-token-sharing',access:'synthetic-plan-access',refresh:'synthetic-plan-refresh',expires:4_102_444_800_000,issuer:'https://auth.openai.com',clientId:'synthetic-client',idToken:`header.${Buffer.from(JSON.stringify({sub:'selected-subject'})).toString('base64url')}.signature`}}},profileId,root,native.cwd);
    assert(params.authorization.owner==='harness');
    params.modelId='gpt-6-luna';params.authorization.plan.modelRoute!.modelId=params.modelId;
    Object.assign(params.authorization.plan.modelRoute!,{authRequirement:'api-key',api:'openai-responses',baseUrl:'https://api.openai.com/v1'});
    Object.assign(params.authorization.plan,{selectedAuthMode:'oauth',selectedAuthFlow:'chatgpt-token-sharing'});
    params.timeoutMs=60_000;params.streamParams={maxTokens:300,temperature:0.2};params.streamParamsMode='preferred';
    params.systemPrompt='Reply only OBSERVER_NATIVE_OK. Do not use tools.';params.prompt='Run the observer native proof.';
    vi.spyOn(oauth,'createCodexResponsesOAuth').mockResolvedValue({resolve:async()=>({token:'synthetic-plan-access',assertCurrent:()=>{}})});
    const nativeObservations: Array<{pid?:number;version?:string;home?:string;exited:boolean;methods:string[]}> = [];
    const create=shared.createIsolatedCodexAppServerClient;
    vi.spyOn(shared,'createIsolatedCodexAppServerClient').mockImplementation(async options=>{
      assert(options?.startOptions);
      const env={...native.env,CODEX_HOME:options.startOptions.env?.CODEX_HOME};
      const envEntries=Object.fromEntries(Object.entries(env).filter((x):x is [string,string]=>x[1]!==undefined));
      // Host and child use the same loopback-only proxy policy, with external requests blocked.
      const client=await create({...options,startOptions:{...options.startOptions,env:envEntries,clearEnv:Object.keys(process.env).filter(k=>!(k in envEntries))}});
      const observation={pid:client.getTransportPid(),version:client.getServerVersion(),home:options.startOptions.env?.CODEX_HOME,exited:false,methods:[] as string[]};nativeObservations.push(observation);
      client.addTransportExitHandler(()=>{observation.exited=true;});
      const request=client.request.bind(client);
      vi.spyOn(client,'request').mockImplementation((method, ...rest)=>{observation.methods.push(method);return request(method,...rest);});
      return client;
    });
    try {
      const options={pluginConfig:{appServer:{transport:'stdio' as const,homeScope:'agent' as const}}};
      const result=await runCodexIsolatedCompletion(params,options);
      expect(result.assistant.content).toContainEqual({type:'text',text:'OBSERVER_NATIVE_OK'});
      expect(received).toHaveLength(1);expect(transport.requested).toEqual(['https://api.openai.com/v1/responses']);
      expect(received[0]).not.toHaveProperty('max_output_tokens');expect(received[0]).not.toHaveProperty('temperature');
      expect(nativeObservations).toHaveLength(1);
      for(const obs of nativeObservations){expect(obs.pid).toBeGreaterThan(0);expect(obs.exited).toBe(true);expect(obs.methods).toContain('turn/start');if(obs.home)await expect(fs.access(obs.home)).rejects.toMatchObject({code:'ENOENT'});}
      const originalMode=params.streamParamsMode;delete params.streamParamsMode;
      await expect(runCodexIsolatedCompletion(params,options)).rejects.toThrow('ChatGPT token sharing does not support');
      expect(received).toHaveLength(1);expect(nativeObservations).toHaveLength(1);params.streamParamsMode=originalMode;
      console.log(JSON.stringify({proof:'observer-auth-real-native',sourceHead:'16d08c5bc9b39a67aa539e2da12a646e98421fec',native:nativeObservations.map(({home,...obs})=>obs),requestCount:received.length,selectedEndpoint:transport.requested[0],output:'OBSERVER_NATIVE_OK',samplingFieldsOmitted:true,explicitLimitsRejectedBeforeSpawn:true,joinedCleanup:true,externalSubstitutions:['synthetic scoped OAuth resolver','provider URL redirected to physical loopback TLS receiver with synthetic SSE response']}));
    } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();vi.unstubAllEnvs();setManagedCodexPluginRoot(undefined);}
  });
});

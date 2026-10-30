# Separate browser network diagnostic

One empty-inventory case at 400 px, against the same actual built Gateway/served assets. Wrapper exit 0; source and build fingerprints unchanged during the run. The source head was bf1deba with only the now-committed catalog fixture edit present; no production behavior changed.

The diagnostic adds console locations and status>=400 response URL/method/type capture. It observes GET /control-ui-config.json returning401 and GET /api/users/gateway-owner/avatar returning404, while recovery-status RPC succeeds and no page exceptions occur. The avatar is the synthetic fixture identity. This attributes the separate diagnostic's messages, not retroactively the original nine cases. Service-worker blocking is configured by the browser harness. No clean-console claim is made.

The exact diagnostic harness is included separately. It never issues a model request or mutating recovery RPC. All state/ports belong to the disposable proof instance.

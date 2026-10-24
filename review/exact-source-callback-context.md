# Exact-source context for the lock-order review finding

This is additional unchanged context omitted from the prior review bundle. No product change since 147-test GREEN. Validate the claimed runtime-lock acquisition in currentCacheScope against the actual supplied callback. Do not assume private field access requires its owner lock. If a different real reverse-lock edge exists, identify its precise call path.

## apps/android/app/src/main/java/ai/openclaw/app/NodeRuntime.kt
SHA256 `b21b6e671909f1129d3c85e68fe632b285d2e9e41e225611bd3c3ed8051b1358`

908:     val browserFocusAvailable: Boolean = false,
909:     val legacyAuth: (() -> JsonObject)? = null,
910:   )
911: 
912:   private val appContext = context.applicationContext
913:   private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
914:   private val tlsProbeRunner = GatewayTlsProbeRunner(scope, tlsFingerprintProbe)
915:   private val deviceAuthStore = DeviceAuthStore(prefs)
916:   val camera =

1938: 
1939:   private fun publishChatSessionDeletion(deletion: ChatSessionDeletion) {
1940:     synchronized(gatewayDataScopeLock) { chatSelectionSeq.incrementAndGet() }
1941:     chatSessionDeletionListeners.values.forEach { listener -> listener(deletion) }
1942:   }
1943: 
1944:   internal val chat: ChatController =
1945:     when (mode) {
1946:       NodeRuntimeMode.Live -> {
1947:         ChatController(
1948:           scope = scope,
1949:           session = operatorSession,
1950:           json = json,
1951:           transcriptCache = chatTranscriptCache,
1952:           cacheScope = ::chatCacheScope,
1953:           currentDefaultAgentId = { gatewayDefaultAgentId.value },
1954:           currentDefaultAgentRevision = gatewayDefaultAgentRevision::get,
1955:           gatewayAdvertisesMethod = ::gatewayAdvertisesMethod,
1956:           gatewayAdvertisesCapability = ::gatewayAdvertisesCapability,
1957:           currentGatewayCatalogRevision = { gatewayMethodsEpoch.value },
1958:           commandOutbox = chatCommandOutbox,
1959:           recordModelRecent = prefs::recordModelRecent,
1960:           onSessionDeleted = ::publishChatSessionDeletion,
1961:           onOfflineDefaultAgentRestored = { prepareMainSessionKey(it, MainSessionUpdate.Sync) },
1962:           onAssistantReplyFinalized = { owner, runId, text ->
1963:             if (!_isForeground.value) {
1964:               ConversationReplyNotifier(appContext).show(owner, runId, text)
1965:             }
1966:           },
1967:         )
1968:       }
1969: 
1970:       NodeRuntimeMode.ScreenshotFixture -> {

2008:     get() = messageSpeechController.state
2009: 
2010:   /**
2011:    * Stable per-gateway scope for the offline chat cache; resolved per call so cached transcripts
2012:    * never leak across gateways. Null (nothing paired/configured) disables cache reads and writes.
2013:    */
2014:   private fun chatCacheGatewayId(): String? = connectedEndpoint?.stableId ?: prefs.gatewayRegistry.activeStableId.value
2015: 
2016:   private fun chatCacheScope(): ChatCacheScope? =
2017:     chatCacheGatewayId()?.let { gatewayId ->
2018:       ChatCacheScope(gatewayId = gatewayId, connectionGeneration = connectAttemptSeq.get())
2019:     }
2020: 

2317:     MainSessionBinding(
2318:       key = sessionKey,
2319:       autoLabel = buildAndroidAppSessionLabel(prefs.displayName.value, identityStore.loadOrCreate().deviceId),
2320:     )
2321: 
2322:   private fun updateMainSessionKey(sessionKey: String): Boolean =
2323:     synchronized(gatewayDataScopeLock) {
2324:       if (_mainSessionKey.value == sessionKey) return@synchronized false
2325:       // Retire reads before publishing an agent change, including a switch back to the same agent.
2326:       resetLegacyMetadataRefresh()
2327:       modelCatalogRefreshGuard.invalidate()
2328:       modelCatalogRefresh = null
2329:       modelCatalogNeedsStatusRefresh = false
2330:       providerModelCatalogRefreshGuard.invalidate()
2331:       providerModelCatalogRefresh = null
2332:       providerModelCatalogNeedsStatusRefresh = true
2333:       _modelCatalog.value = emptyList()
2334:       _providerModelCatalog.value = emptyList()
2335:       _modelAuthProviders.value = emptyList()
2336:       _providerModelCatalogRefreshing.value = false
2337:       _providerModelCatalogErrorText.value = null
2338:       _mainSessionKey.value = sessionKey
2339:       if (operatorConnected) {
2340:         refreshModelCatalog()
2341:         refreshProviderModels()
2342:       }
2343:       true
2344:     }
2345: 

5348: 
5349:   private fun resetLegacyMetadataRefresh() =
5350:     synchronized(gatewayDataScopeLock) {
5351:       legacyMetadataRefreshPending = false
5352:       legacyMetadataRefreshJob?.cancel()
5353:       legacyMetadataRefreshJob = null
5354:     }
5355: 
5356:   private fun refreshLegacyMetadata() {
5357:     synchronized(gatewayDataScopeLock) {
5358:       if (!operatorConnected || mode == NodeRuntimeMode.ScreenshotFixture) return
5359:       legacyMetadataRefreshPending = true
5360:       if (legacyMetadataRefreshJob != null) return
5361:       lateinit var refresh: Job
5362:       refresh =
5363:         scope.launch(start = CoroutineStart.LAZY) {
5364:           try {
5365:             while (true) {
5366:               synchronized(gatewayDataScopeLock) {
5367:                 if (!legacyMetadataRefreshPending) return@launch
5368:                 legacyMetadataRefreshPending = false
5369:                 launch { refreshModelCatalogFromGateway(legacyHint = true) }
5370:                 launch { refreshProviderModelsFromGateway(legacyHint = true) }
5371:                 if (!chat.refreshCommandsFromLegacyHint()) legacyMetadataRefreshPending = true
5372:               }
5373:               // Stable 2026.9.6 publishes unflagged hints even for read completion. A fixed
5374:               // window bounds that feedback without postponing changes until it goes quiet.
5375:               // Remove this path when supported Gateways all publish semantic change flags.
5376:               delay(LEGACY_METADATA_REFRESH_INTERVAL_MS)
5377:             }
5378:           } finally {
5379:             synchronized(gatewayDataScopeLock) {
5380:               if (legacyMetadataRefreshJob === refresh) legacyMetadataRefreshJob = null
5381:             }
5382:           }
5383:         }
5384:       legacyMetadataRefreshJob = refresh
5385:       refresh.start()
5386:     }
5387:   }
5388: 
5389:   private fun handleGatewayEvent(
5390:     event: String,
5391:     payloadJson: String?,
5392:   ) {
5393:     if (event == "update.available") {
5394:       _gatewayUpdateAvailable.value = parseGatewayUpdateAvailable(payloadJson)
5395:     }

## apps/android/app/src/main/java/ai/openclaw/app/chat/ChatController.kt
SHA256 `cf5c5ecd611094703b0f4f30edd9383337cf4090c1dc71eb1463698736c79638`

2358:     }
2359:   }
2360: 
2361:   /** Refreshes the available text slash commands for the current gateway. */
2362:   fun refreshCommands() {
2363:     refreshChatMetadata(ChatMetadataRefreshReason.Invalidation)
2364:   }
2365: 
2366:   internal fun refreshCommandsFromLegacyHint(): Boolean =
2367:     synchronized(gatewayScopeApplyLock) {
2368:       val active = chatMetadataRefresh
2369:       if (
2370:         active?.sequence == chatMetadataRequestSequence.get() &&
2371:         active.cacheScope == currentCacheScope() && active.metadataScope == currentChatMetadataScope()
2372:       ) {
2373:         // NodeRuntime retains this hint for its next fixed window; do not retire a valid read.
2374:         return@synchronized false
2375:       }
2376:       refreshCommands()
2377:       true
2378:     }
2379: 
2380:   private fun refreshChatMetadata(reason: ChatMetadataRefreshReason): Job? {
2381:     val refresh =
2382:       synchronized(gatewayScopeApplyLock) {
2383:         val metadataScope = currentChatMetadataScope() ?: return null
2384:         val cacheScope = currentCacheScope()
2385:         val active = chatMetadataRefresh
2386:         if (
2387:           reason != ChatMetadataRefreshReason.Invalidation &&
2388:           active?.sequence == chatMetadataRequestSequence.get() &&
2389:           active.cacheScope == cacheScope && active.metadataScope == metadataScope
2390:         ) {
2391:           if (reason == ChatMetadataRefreshReason.Status) active.statusRequested = true
2392:           return active.job
2393:         }
2394:         if (reason == ChatMetadataRefreshReason.Health && hasCurrentChatMetadata()) return null
2395:         if (reason == ChatMetadataRefreshReason.Status && hasCurrentChatMetadata() && !chatMetadataNeedsStatusRefresh) return null
2396:         // Genuine invalidations fence queued old results immediately; observations join them.
2397:         ChatMetadataRefresh(chatMetadataRequestSequence.incrementAndGet(), cacheScope, metadataScope).also { next ->
2398:           next.job = scope.launch(start = CoroutineStart.LAZY) { fetchChatMetadata(next) }
2399:           chatMetadataRefresh = next
2400:         }
2401:       }
2402:     refresh.job?.start()
2403:     return refresh.job
2404:   }
2405: 
2406:   /** Updates or clears the explicit Fast Mode override for future runs in one session. */
2407:   fun setSessionFastMode(

3072:     resolveAgentIdFromMainSessionKey(sessionKey)
3073:       ?: ownerAgentId?.trim()?.takeIf { it.isNotEmpty() }
3074: 
3075:   private fun resolveAgentIdForSessionKey(parentKey: String): String? =
3076:     resolveAgentIdFromMainSessionKey(parentKey)
3077:       ?: _sessionOwnerAgentId.value
3078:       ?: effectiveDefaultAgentId()
3079: 
3080:   private fun activeSessionTracksDefaultAgent(sessionKey: String): Boolean = resolveAgentIdFromMainSessionKey(sessionKey) == null && _sessionOwnerAgentId.value == null

4795:     }
4796:   }
4797: 
4798:   private fun currentChatMetadataScope(): ChatMetadataScope? {
4799:     val sessionKey = _sessionKey.value
4800:     val agentId = resolveAgentIdForSessionKey(sessionKey) ?: return null
4801:     // Stable v2026.7.1-2 accepts only agentId. Retire this negotiation only when the
4802:     // minimum supported Gateway contract guarantees session-scoped chat.metadata.
4803:     return ChatMetadataScope(agentId, sessionKey)
4804:   }
4805: 

8061:       request(legacyParams)
8062:     }
8063:   }
8064: 
8065:   private fun currentCacheScope(): ChatCacheScope? {
8066:     val current = cacheScope() ?: return null
8067:     val gatewayId = current.gatewayId.trim().takeIf { it.isNotEmpty() } ?: return null
8068:     return if (gatewayId == current.gatewayId) current else current.copy(gatewayId = gatewayId)
8069:   }
8070: 
8071:   private fun isSessionModelSelectionLocked(key: SessionSettingsKey): Boolean =
8072:     (
8073:       pendingSettingsMutations[key]?.confirmed
8074:         ?: _sessions.value.firstOrNull {
8075:           it.key == key.sessionKey && (it.ownerAgentId ?: resolveAgentIdFromMainSessionKey(it.key)) == key.ownerAgentId
8076:         }
8077:     )?.modelSelectionLocked == true
8078: 
8079:   /** Keeps an unscoped chat bound to its verified agent only while the same gateway reconnects. */
8080:   private fun effectiveDefaultAgentId(): String? {
8081:     currentDefaultAgentId()?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
8082:     val gatewayId = currentCacheScope()?.gatewayId ?: return null
8083:     return lastVerifiedDefaultAgentId.takeIf { lastVerifiedDefaultAgentGatewayId == gatewayId }
8084:   }

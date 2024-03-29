"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var apollo_link_1 = require("apollo-link");
var apollo_link_dedup_1 = require("apollo-link-dedup");
var apollo_utilities_1 = require("apollo-utilities");
var ts_invariant_1 = require("ts-invariant");
var ApolloError_1 = require("../errors/ApolloError");
var Observable_1 = require("../util/Observable");
var mutations_1 = require("../data/mutations");
var queries_1 = require("../data/queries");
var ObservableQuery_1 = require("./ObservableQuery");
var networkStatus_1 = require("./networkStatus");
var types_1 = require("./types");
var LocalState_1 = require("./LocalState");
var QueryManager = (function () {
    function QueryManager(_a) {
        var link = _a.link, _b = _a.queryDeduplication, queryDeduplication = _b === void 0 ? false : _b, store = _a.store, _c = _a.onBroadcast, onBroadcast = _c === void 0 ? function () { return undefined; } : _c, _d = _a.ssrMode, ssrMode = _d === void 0 ? false : _d, _e = _a.clientAwareness, clientAwareness = _e === void 0 ? {} : _e, localState = _a.localState;
        this.mutationStore = new mutations_1.MutationStore();
        this.queryStore = new queries_1.QueryStore();
        this.clientAwareness = {};
        this.idCounter = 1;
        this.queries = new Map();
        this.fetchQueryRejectFns = new Map();
        this.queryIdsByName = {};
        this.pollingInfoByQueryId = new Map();
        this.nextPoll = null;
        this.link = link;
        this.deduplicator = apollo_link_1.ApolloLink.from([new apollo_link_dedup_1.DedupLink(), link]);
        this.queryDeduplication = queryDeduplication;
        this.dataStore = store;
        this.onBroadcast = onBroadcast;
        this.clientAwareness = clientAwareness;
        this.localState = localState || new LocalState_1.LocalState({ cache: store.getCache() });
        this.ssrMode = ssrMode;
    }
    QueryManager.prototype.stop = function () {
        var _this = this;
        this.queries.forEach(function (_info, queryId) {
            _this.stopQueryNoBroadcast(queryId);
        });
        this.fetchQueryRejectFns.forEach(function (reject) {
            reject(new Error('QueryManager stopped while query was in flight'));
        });
    };
    QueryManager.prototype.mutate = function (_a) {
        var mutation = _a.mutation, variables = _a.variables, optimisticResponse = _a.optimisticResponse, updateQueriesByName = _a.updateQueries, _b = _a.refetchQueries, refetchQueries = _b === void 0 ? [] : _b, _c = _a.awaitRefetchQueries, awaitRefetchQueries = _c === void 0 ? false : _c, updateWithProxyFn = _a.update, _d = _a.errorPolicy, errorPolicy = _d === void 0 ? 'none' : _d, fetchPolicy = _a.fetchPolicy, _e = _a.context, context = _e === void 0 ? {} : _e;
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var mutationId, cache, generateUpdateQueriesInfo, updatedVariables, _f;
            var _this = this;
            return tslib_1.__generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        ts_invariant_1.invariant(mutation, 'mutation option is required. You must specify your GraphQL document in the mutation option.');
                        ts_invariant_1.invariant(!fetchPolicy || fetchPolicy === 'no-cache', "fetchPolicy for mutations currently only supports the 'no-cache' policy");
                        mutationId = this.generateQueryId();
                        cache = this.dataStore.getCache();
                        (mutation = cache.transformDocument(mutation)),
                            (variables = apollo_utilities_1.assign({}, apollo_utilities_1.getDefaultValues(apollo_utilities_1.getMutationDefinition(mutation)), variables));
                        this.setQuery(mutationId, function () { return ({ document: mutation }); });
                        generateUpdateQueriesInfo = function () {
                            var ret = {};
                            if (updateQueriesByName) {
                                Object.keys(updateQueriesByName).forEach(function (queryName) {
                                    return (_this.queryIdsByName[queryName] || []).forEach(function (queryId) {
                                        ret[queryId] = {
                                            updater: updateQueriesByName[queryName],
                                            query: _this.queryStore.get(queryId),
                                        };
                                    });
                                });
                            }
                            return ret;
                        };
                        if (!apollo_utilities_1.hasClientExports(mutation)) return [3, 2];
                        return [4, this.localState.addExportedVariables(mutation, variables, context)];
                    case 1:
                        _f = _g.sent();
                        return [3, 3];
                    case 2:
                        _f = variables;
                        _g.label = 3;
                    case 3:
                        updatedVariables = _f;
                        this.mutationStore.initMutation(mutationId, mutation, updatedVariables);
                        this.dataStore.markMutationInit({
                            mutationId: mutationId,
                            document: mutation,
                            variables: updatedVariables || {},
                            updateQueries: generateUpdateQueriesInfo(),
                            update: updateWithProxyFn,
                            optimisticResponse: optimisticResponse,
                        });
                        this.broadcastQueries();
                        return [2, new Promise(function (resolve, reject) {
                                var storeResult;
                                var error;
                                var operation = _this.buildOperationForLink(mutation, updatedVariables, tslib_1.__assign({}, context, { optimisticResponse: optimisticResponse }));
                                var completeMutation = function () {
                                    if (error) {
                                        _this.mutationStore.markMutationError(mutationId, error);
                                    }
                                    _this.dataStore.markMutationComplete({
                                        mutationId: mutationId,
                                        optimisticResponse: optimisticResponse,
                                    });
                                    _this.broadcastQueries();
                                    if (error) {
                                        return Promise.reject(error);
                                    }
                                    if (typeof refetchQueries === 'function') {
                                        refetchQueries = refetchQueries(storeResult);
                                    }
                                    var refetchQueryPromises = [];
                                    for (var _i = 0, refetchQueries_1 = refetchQueries; _i < refetchQueries_1.length; _i++) {
                                        var refetchQuery = refetchQueries_1[_i];
                                        if (typeof refetchQuery === 'string') {
                                            var promise = _this.refetchQueryByName(refetchQuery);
                                            if (promise) {
                                                refetchQueryPromises.push(promise);
                                            }
                                            continue;
                                        }
                                        var queryOptions = {
                                            query: refetchQuery.query,
                                            variables: refetchQuery.variables,
                                            fetchPolicy: 'network-only',
                                        };
                                        if (refetchQuery.context) {
                                            queryOptions.context = refetchQuery.context;
                                        }
                                        refetchQueryPromises.push(_this.query(queryOptions));
                                    }
                                    return Promise.all(awaitRefetchQueries ? refetchQueryPromises : []).then(function () {
                                        _this.setQuery(mutationId, function () { return ({ document: null }); });
                                        if (errorPolicy === 'ignore' &&
                                            storeResult &&
                                            apollo_utilities_1.graphQLResultHasError(storeResult)) {
                                            delete storeResult.errors;
                                        }
                                        return storeResult;
                                    });
                                };
                                var clientQuery = _this.localState.clientQuery(operation.query);
                                var serverQuery = _this.localState.serverQuery(operation.query);
                                if (serverQuery) {
                                    operation.query = serverQuery;
                                }
                                var obs = serverQuery
                                    ? apollo_link_1.execute(_this.link, operation)
                                    : Observable_1.Observable.of({
                                        data: {},
                                    });
                                var self = _this;
                                var complete = false;
                                var handlingNext = false;
                                obs.subscribe({
                                    next: function (result) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                        var updatedResult, context, variables;
                                        return tslib_1.__generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    handlingNext = true;
                                                    if (apollo_utilities_1.graphQLResultHasError(result) && errorPolicy === 'none') {
                                                        handlingNext = false;
                                                        error = new ApolloError_1.ApolloError({
                                                            graphQLErrors: result.errors,
                                                        });
                                                        return [2];
                                                    }
                                                    self.mutationStore.markMutationResult(mutationId);
                                                    updatedResult = result;
                                                    context = operation.context, variables = operation.variables;
                                                    if (!(clientQuery && apollo_utilities_1.hasDirectives(['client'], clientQuery))) return [3, 2];
                                                    return [4, self.localState
                                                            .runResolvers({
                                                            document: clientQuery,
                                                            remoteResult: result,
                                                            context: context,
                                                            variables: variables,
                                                        })
                                                            .catch(function (error) {
                                                            handlingNext = false;
                                                            reject(error);
                                                            return result;
                                                        })];
                                                case 1:
                                                    updatedResult = _a.sent();
                                                    _a.label = 2;
                                                case 2:
                                                    if (fetchPolicy !== 'no-cache') {
                                                        self.dataStore.markMutationResult({
                                                            mutationId: mutationId,
                                                            result: updatedResult,
                                                            document: mutation,
                                                            variables: updatedVariables || {},
                                                            updateQueries: generateUpdateQueriesInfo(),
                                                            update: updateWithProxyFn,
                                                        });
                                                    }
                                                    storeResult = updatedResult;
                                                    handlingNext = false;
                                                    if (complete) {
                                                        completeMutation().then(resolve, reject);
                                                    }
                                                    return [2];
                                            }
                                        });
                                    }); },
                                    error: function (err) {
                                        self.mutationStore.markMutationError(mutationId, err);
                                        self.dataStore.markMutationComplete({
                                            mutationId: mutationId,
                                            optimisticResponse: optimisticResponse,
                                        });
                                        self.broadcastQueries();
                                        self.setQuery(mutationId, function () { return ({ document: null }); });
                                        reject(new ApolloError_1.ApolloError({
                                            networkError: err,
                                        }));
                                    },
                                    complete: function () {
                                        if (!handlingNext) {
                                            completeMutation().then(resolve, reject);
                                        }
                                        complete = true;
                                    },
                                });
                            })];
                }
            });
        });
    };
    QueryManager.prototype.fetchQuery = function (queryId, options, fetchType, fetchMoreForQueryId) {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            var _a, variables, _b, metadata, _c, fetchPolicy, _d, context, cache, query, updatedVariables, _e, updatedOptions, storeResult, needToFetch, _f, complete, result, shouldFetch, requestId, cancel, shouldDispatchClientResult, networkResult;
            var _this = this;
            return tslib_1.__generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _a = options.variables, variables = _a === void 0 ? {} : _a, _b = options.metadata, metadata = _b === void 0 ? null : _b, _c = options.fetchPolicy, fetchPolicy = _c === void 0 ? 'cache-first' : _c, _d = options.context, context = _d === void 0 ? {} : _d;
                        cache = this.dataStore.getCache();
                        query = cache.transformDocument(options.query);
                        if (!apollo_utilities_1.hasClientExports(query)) return [3, 2];
                        return [4, this.localState.addExportedVariables(query, variables, context)];
                    case 1:
                        _e = _g.sent();
                        return [3, 3];
                    case 2:
                        _e = variables;
                        _g.label = 3;
                    case 3:
                        updatedVariables = _e;
                        updatedOptions = tslib_1.__assign({}, options, { variables: updatedVariables });
                        needToFetch = fetchPolicy === 'network-only' || fetchPolicy === 'no-cache';
                        if (fetchType !== types_1.FetchType.refetch &&
                            fetchPolicy !== 'network-only' &&
                            fetchPolicy !== 'no-cache') {
                            _f = this.dataStore.getCache().diff({
                                query: query,
                                variables: updatedVariables,
                                returnPartialData: true,
                                optimistic: false,
                            }), complete = _f.complete, result = _f.result;
                            needToFetch = !complete || fetchPolicy === 'cache-and-network';
                            storeResult = result;
                        }
                        shouldFetch = needToFetch && fetchPolicy !== 'cache-only' && fetchPolicy !== 'standby';
                        if (apollo_utilities_1.hasDirectives(['live'], query))
                            shouldFetch = true;
                        requestId = this.generateRequestId();
                        cancel = this.updateQueryWatch(queryId, query, updatedOptions);
                        this.setQuery(queryId, function () { return ({
                            document: query,
                            lastRequestId: requestId,
                            invalidated: true,
                            cancel: cancel,
                        }); });
                        this.invalidate(true, fetchMoreForQueryId);
                        this.queryStore.initQuery({
                            queryId: queryId,
                            document: query,
                            storePreviousVariables: shouldFetch,
                            variables: updatedVariables,
                            isPoll: fetchType === types_1.FetchType.poll,
                            isRefetch: fetchType === types_1.FetchType.refetch,
                            metadata: metadata,
                            fetchMoreForQueryId: fetchMoreForQueryId,
                        });
                        this.broadcastQueries();
                        shouldDispatchClientResult = !shouldFetch || fetchPolicy === 'cache-and-network';
                        if (shouldDispatchClientResult) {
                            this.queryStore.markQueryResultClient(queryId, !shouldFetch);
                            this.invalidate(true, queryId, fetchMoreForQueryId);
                            this.broadcastQueries(this.localState.shouldForceResolvers(query));
                        }
                        if (shouldFetch) {
                            networkResult = this.fetchRequest({
                                requestId: requestId,
                                queryId: queryId,
                                document: query,
                                options: updatedOptions,
                                fetchMoreForQueryId: fetchMoreForQueryId,
                            }).catch(function (error) {
                                if (ApolloError_1.isApolloError(error)) {
                                    throw error;
                                }
                                else {
                                    var lastRequestId = _this.getQuery(queryId).lastRequestId;
                                    if (requestId >= (lastRequestId || 1)) {
                                        _this.queryStore.markQueryError(queryId, error, fetchMoreForQueryId);
                                        _this.invalidate(true, queryId, fetchMoreForQueryId);
                                        _this.broadcastQueries();
                                    }
                                    throw new ApolloError_1.ApolloError({ networkError: error });
                                }
                            });
                            if (fetchPolicy !== 'cache-and-network') {
                                return [2, networkResult];
                            }
                            else {
                                networkResult.catch(function () { });
                            }
                        }
                        return [2, Promise.resolve({ data: storeResult })];
                }
            });
        });
    };
    QueryManager.prototype.queryListenerForObserver = function (queryId, options, observer) {
        var _this = this;
        var previouslyHadError = false;
        return function (queryStoreValue, newData, forceResolvers) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
            var observableQuery, fetchPolicy, errorPolicy, lastResult, lastError, shouldNotifyIfLoading, networkStatusChanged, errorStatusChanged, apolloError_1, data, isMissing, document_1, readResult, resultFromStore, query, variables, context, updatedResult, e_1, error_1;
            return tslib_1.__generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.invalidate(false, queryId);
                        if (!queryStoreValue)
                            return [2];
                        observableQuery = this.getQuery(queryId).observableQuery;
                        fetchPolicy = observableQuery
                            ? observableQuery.options.fetchPolicy
                            : options.fetchPolicy;
                        if (fetchPolicy === 'standby')
                            return [2];
                        errorPolicy = observableQuery
                            ? observableQuery.options.errorPolicy
                            : options.errorPolicy;
                        lastResult = observableQuery
                            ? observableQuery.getLastResult()
                            : null;
                        lastError = observableQuery ? observableQuery.getLastError() : null;
                        shouldNotifyIfLoading = (!newData && queryStoreValue.previousVariables != null) ||
                            fetchPolicy === 'cache-only' ||
                            fetchPolicy === 'cache-and-network';
                        networkStatusChanged = Boolean(lastResult &&
                            queryStoreValue.networkStatus !== lastResult.networkStatus);
                        errorStatusChanged = errorPolicy &&
                            (lastError && lastError.graphQLErrors) !==
                                queryStoreValue.graphQLErrors &&
                            errorPolicy !== 'none';
                        if (!(!networkStatus_1.isNetworkRequestInFlight(queryStoreValue.networkStatus) ||
                            (networkStatusChanged && options.notifyOnNetworkStatusChange) ||
                            shouldNotifyIfLoading)) return [3, 8];
                        if (((!errorPolicy || errorPolicy === 'none') &&
                            queryStoreValue.graphQLErrors &&
                            queryStoreValue.graphQLErrors.length > 0) ||
                            queryStoreValue.networkError) {
                            apolloError_1 = new ApolloError_1.ApolloError({
                                graphQLErrors: queryStoreValue.graphQLErrors,
                                networkError: queryStoreValue.networkError,
                            });
                            previouslyHadError = true;
                            if (observer.error) {
                                try {
                                    observer.error(apolloError_1);
                                }
                                catch (e) {
                                    setTimeout(function () {
                                        throw e;
                                    }, 0);
                                }
                            }
                            else {
                                setTimeout(function () {
                                    throw apolloError_1;
                                }, 0);
                                if (process.env.NODE_ENV !== 'production') {
                                    console.info('An unhandled error was thrown because no error handler is registered ' +
                                        'for the query ' +
                                        JSON.stringify(queryStoreValue.document));
                                }
                            }
                            return [2];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        data = void 0;
                        isMissing = void 0;
                        if (newData) {
                            if (fetchPolicy !== 'no-cache') {
                                this.setQuery(queryId, function () { return ({ newData: null }); });
                            }
                            data = newData.result;
                            isMissing = !newData.complete || false;
                        }
                        else {
                            if (lastResult && lastResult.data && !errorStatusChanged) {
                                data = lastResult.data;
                                isMissing = false;
                            }
                            else {
                                document_1 = this.getQuery(queryId).document;
                                readResult = this.dataStore.getCache().diff({
                                    query: document_1,
                                    variables: queryStoreValue.previousVariables ||
                                        queryStoreValue.variables,
                                    optimistic: true,
                                });
                                data = readResult.result;
                                isMissing = !readResult.complete;
                            }
                        }
                        resultFromStore = void 0;
                        if (isMissing && fetchPolicy !== 'cache-only') {
                            resultFromStore = {
                                data: lastResult && lastResult.data,
                                loading: networkStatus_1.isNetworkRequestInFlight(queryStoreValue.networkStatus),
                                networkStatus: queryStoreValue.networkStatus,
                                stale: true,
                            };
                        }
                        else {
                            resultFromStore = {
                                data: data,
                                loading: networkStatus_1.isNetworkRequestInFlight(queryStoreValue.networkStatus),
                                networkStatus: queryStoreValue.networkStatus,
                                stale: false,
                            };
                        }
                        if (errorPolicy === 'all' &&
                            queryStoreValue.graphQLErrors &&
                            queryStoreValue.graphQLErrors.length > 0) {
                            resultFromStore.errors = queryStoreValue.graphQLErrors;
                        }
                        if (!observer.next) return [3, 6];
                        if (!(previouslyHadError ||
                            !observableQuery ||
                            observableQuery.isDifferentFromLastResult(resultFromStore))) return [3, 6];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        if (!forceResolvers) return [3, 4];
                        query = options.query, variables = options.variables, context = options.context;
                        return [4, this.localState.runResolvers({
                                document: query,
                                remoteResult: resultFromStore,
                                context: context,
                                variables: variables,
                                onlyRunForcedResolvers: forceResolvers,
                            })];
                    case 3:
                        updatedResult = _a.sent();
                        resultFromStore = tslib_1.__assign({}, resultFromStore, updatedResult);
                        _a.label = 4;
                    case 4:
                        observer.next(resultFromStore);
                        return [3, 6];
                    case 5:
                        e_1 = _a.sent();
                        setTimeout(function () {
                            throw e_1;
                        }, 0);
                        return [3, 6];
                    case 6:
                        previouslyHadError = false;
                        return [3, 8];
                    case 7:
                        error_1 = _a.sent();
                        previouslyHadError = true;
                        if (observer.error)
                            observer.error(new ApolloError_1.ApolloError({ networkError: error_1 }));
                        return [2];
                    case 8: return [2];
                }
            });
        }); };
    };
    QueryManager.prototype.watchQuery = function (options, shouldSubscribe) {
        if (shouldSubscribe === void 0) { shouldSubscribe = true; }
        ts_invariant_1.invariant(options.fetchPolicy !== 'standby', 'client.watchQuery cannot be called with fetchPolicy set to "standby"');
        var queryDefinition = apollo_utilities_1.getQueryDefinition(options.query);
        if (queryDefinition.variableDefinitions &&
            queryDefinition.variableDefinitions.length) {
            var defaultValues = apollo_utilities_1.getDefaultValues(queryDefinition);
            options.variables = apollo_utilities_1.assign({}, defaultValues, options.variables);
        }
        if (typeof options.notifyOnNetworkStatusChange === 'undefined') {
            options.notifyOnNetworkStatusChange = false;
        }
        var transformedOptions = tslib_1.__assign({}, options);
        return new ObservableQuery_1.ObservableQuery({
            queryManager: this,
            options: transformedOptions,
            shouldSubscribe: shouldSubscribe,
        });
    };
    QueryManager.prototype.query = function (options) {
        var _this = this;
        ts_invariant_1.invariant(options.query, 'query option is required. You must specify your GraphQL document ' +
            'in the query option.');
        ts_invariant_1.invariant(options.query.kind === 'Document', 'You must wrap the query string in a "gql" tag.');
        ts_invariant_1.invariant(!options.returnPartialData, 'returnPartialData option only supported on watchQuery.');
        ts_invariant_1.invariant(!options.pollInterval, 'pollInterval option only supported on watchQuery.');
        return new Promise(function (resolve, reject) {
            var watchedQuery = _this.watchQuery(options, false);
            _this.fetchQueryRejectFns.set("query:" + watchedQuery.queryId, reject);
            watchedQuery
                .result()
                .then(resolve, reject)
                .then(function () {
                return _this.fetchQueryRejectFns.delete("query:" + watchedQuery.queryId);
            });
        });
    };
    QueryManager.prototype.generateQueryId = function () {
        var queryId = this.idCounter.toString();
        this.idCounter++;
        return queryId;
    };
    QueryManager.prototype.stopQueryInStore = function (queryId) {
        this.stopQueryInStoreNoBroadcast(queryId);
        this.broadcastQueries();
    };
    QueryManager.prototype.stopQueryInStoreNoBroadcast = function (queryId) {
        this.stopPollingQuery(queryId);
        this.queryStore.stopQuery(queryId);
        this.invalidate(true, queryId);
    };
    QueryManager.prototype.addQueryListener = function (queryId, listener) {
        this.setQuery(queryId, function (_a) {
            var _b = _a.listeners, listeners = _b === void 0 ? [] : _b;
            return ({
                listeners: listeners.concat([listener]),
                invalidated: false,
            });
        });
    };
    QueryManager.prototype.updateQueryWatch = function (queryId, document, options) {
        var _this = this;
        var cancel = this.getQuery(queryId).cancel;
        if (cancel)
            cancel();
        var previousResult = function () {
            var previousResult = null;
            var observableQuery = _this.getQuery(queryId).observableQuery;
            if (observableQuery) {
                var lastResult = observableQuery.getLastResult();
                if (lastResult) {
                    previousResult = lastResult.data;
                }
            }
            return previousResult;
        };
        return this.dataStore.getCache().watch({
            query: document,
            variables: options.variables,
            optimistic: true,
            previousResult: previousResult,
            callback: function (newData) {
                _this.setQuery(queryId, function () { return ({ invalidated: true, newData: newData }); });
            },
        });
    };
    QueryManager.prototype.addObservableQuery = function (queryId, observableQuery) {
        this.setQuery(queryId, function () { return ({ observableQuery: observableQuery }); });
        var queryDef = apollo_utilities_1.getQueryDefinition(observableQuery.options.query);
        if (queryDef.name && queryDef.name.value) {
            var queryName = queryDef.name.value;
            this.queryIdsByName[queryName] = this.queryIdsByName[queryName] || [];
            this.queryIdsByName[queryName].push(observableQuery.queryId);
        }
    };
    QueryManager.prototype.removeObservableQuery = function (queryId) {
        var _a = this.getQuery(queryId), observableQuery = _a.observableQuery, cancel = _a.cancel;
        if (cancel)
            cancel();
        if (!observableQuery)
            return;
        var definition = apollo_utilities_1.getQueryDefinition(observableQuery.options.query);
        var queryName = definition.name ? definition.name.value : null;
        this.setQuery(queryId, function () { return ({ observableQuery: null }); });
        if (queryName) {
            this.queryIdsByName[queryName] = this.queryIdsByName[queryName].filter(function (val) {
                return !(observableQuery.queryId === val);
            });
        }
    };
    QueryManager.prototype.clearStore = function () {
        this.fetchQueryRejectFns.forEach(function (reject) {
            reject(new Error('Store reset while query was in flight(not completed in link chain)'));
        });
        var resetIds = [];
        this.queries.forEach(function (_a, queryId) {
            var observableQuery = _a.observableQuery;
            if (observableQuery)
                resetIds.push(queryId);
        });
        this.queryStore.reset(resetIds);
        this.mutationStore.reset();
        var reset = this.dataStore.reset();
        return reset;
    };
    QueryManager.prototype.resetStore = function () {
        var _this = this;
        return this.clearStore().then(function () {
            return _this.reFetchObservableQueries();
        });
    };
    QueryManager.prototype.reFetchObservableQueries = function (includeStandby) {
        var observableQueryPromises = this.getObservableQueryPromises(includeStandby);
        this.broadcastQueries();
        return Promise.all(observableQueryPromises);
    };
    QueryManager.prototype.startQuery = function (queryId, options, listener) {
        this.addQueryListener(queryId, listener);
        this.fetchQuery(queryId, options)
            .catch(function () { return undefined; });
        return queryId;
    };
    QueryManager.prototype.startGraphQLSubscription = function (options) {
        var _this = this;
        var query = options.query;
        var isCacheEnabled = !(options.fetchPolicy && options.fetchPolicy === 'no-cache');
        var cache = this.dataStore.getCache();
        var transformedDoc = cache.transformDocument(query);
        var variables = apollo_utilities_1.assign({}, apollo_utilities_1.getDefaultValues(apollo_utilities_1.getOperationDefinition(query)), options.variables);
        var updatedVariables = variables;
        var sub;
        var observers = [];
        var clientQuery = this.localState.clientQuery(transformedDoc);
        return new Observable_1.Observable(function (observer) {
            observers.push(observer);
            if (observers.length === 1) {
                var activeNextCalls_1 = 0;
                var complete_1 = false;
                var handler_1 = {
                    next: function (result) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                        var updatedResult;
                        return tslib_1.__generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    activeNextCalls_1 += 1;
                                    updatedResult = result;
                                    if (!(clientQuery && apollo_utilities_1.hasDirectives(['client'], clientQuery))) return [3, 2];
                                    return [4, this.localState.runResolvers({
                                            document: clientQuery,
                                            remoteResult: result,
                                            context: {},
                                            variables: updatedVariables,
                                        })];
                                case 1:
                                    updatedResult = _a.sent();
                                    _a.label = 2;
                                case 2:
                                    if (isCacheEnabled) {
                                        this.dataStore.markSubscriptionResult(updatedResult, transformedDoc, updatedVariables);
                                        this.broadcastQueries();
                                    }
                                    observers.forEach(function (obs) {
                                        if (apollo_utilities_1.graphQLResultHasError(updatedResult) && obs.error) {
                                            obs.error(new ApolloError_1.ApolloError({
                                                graphQLErrors: updatedResult.errors,
                                            }));
                                        }
                                        else if (obs.next) {
                                            obs.next(updatedResult);
                                        }
                                        activeNextCalls_1 -= 1;
                                    });
                                    if (activeNextCalls_1 === 0 && complete_1) {
                                        handler_1.complete();
                                    }
                                    return [2];
                            }
                        });
                    }); },
                    error: function (error) {
                        observers.forEach(function (obs) {
                            if (obs.error) {
                                obs.error(error);
                            }
                        });
                    },
                    complete: function () {
                        if (activeNextCalls_1 === 0) {
                            observers.forEach(function (obs) {
                                if (obs.complete) {
                                    obs.complete();
                                }
                            });
                        }
                        complete_1 = true;
                    }
                };
                (function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    var updatedVariables, _a, serverQuery, operation;
                    return tslib_1.__generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                if (!apollo_utilities_1.hasClientExports(transformedDoc)) return [3, 2];
                                return [4, this.localState.addExportedVariables(transformedDoc, variables)];
                            case 1:
                                _a = _b.sent();
                                return [3, 3];
                            case 2:
                                _a = variables;
                                _b.label = 3;
                            case 3:
                                updatedVariables = _a;
                                serverQuery = this.localState.serverQuery(transformedDoc);
                                if (serverQuery) {
                                    operation = this.buildOperationForLink(serverQuery, updatedVariables);
                                    sub = apollo_link_1.execute(this.link, operation).subscribe(handler_1);
                                }
                                else {
                                    sub = Observable_1.Observable.of({ data: {} }).subscribe(handler_1);
                                }
                                return [2];
                        }
                    });
                }); })();
            }
            return function () {
                observers = observers.filter(function (obs) { return obs !== observer; });
                if (observers.length === 0 && sub) {
                    sub.unsubscribe();
                }
            };
        });
    };
    QueryManager.prototype.stopQuery = function (queryId) {
        this.stopQueryNoBroadcast(queryId);
        this.broadcastQueries();
    };
    QueryManager.prototype.stopQueryNoBroadcast = function (queryId) {
        this.stopQueryInStoreNoBroadcast(queryId);
        this.removeQuery(queryId);
    };
    QueryManager.prototype.removeQuery = function (queryId) {
        var subscriptions = this.getQuery(queryId).subscriptions;
        this.fetchQueryRejectFns.delete("query:" + queryId);
        this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
        subscriptions.forEach(function (x) { return x.unsubscribe(); });
        this.queries.delete(queryId);
    };
    QueryManager.prototype.getCurrentQueryResult = function (observableQuery, optimistic) {
        if (optimistic === void 0) { optimistic = true; }
        var _a = observableQuery.options, variables = _a.variables, query = _a.query;
        var lastResult = observableQuery.getLastResult();
        var newData = this.getQuery(observableQuery.queryId).newData;
        if (newData && newData.complete) {
            return { data: newData.result, partial: false };
        }
        else {
            try {
                var data = this.dataStore.getCache().read({
                    query: query,
                    variables: variables,
                    previousResult: lastResult ? lastResult.data : undefined,
                    optimistic: optimistic,
                }) || undefined;
                return { data: data, partial: false };
            }
            catch (e) {
                return { data: undefined, partial: true };
            }
        }
    };
    QueryManager.prototype.getQueryWithPreviousResult = function (queryIdOrObservable) {
        var observableQuery;
        if (typeof queryIdOrObservable === 'string') {
            var foundObserveableQuery = this.getQuery(queryIdOrObservable).observableQuery;
            ts_invariant_1.invariant(foundObserveableQuery, "ObservableQuery with this id doesn't exist: " + queryIdOrObservable);
            observableQuery = foundObserveableQuery;
        }
        else {
            observableQuery = queryIdOrObservable;
        }
        var _a = observableQuery.options, variables = _a.variables, query = _a.query;
        var data = this.getCurrentQueryResult(observableQuery, false).data;
        return {
            previousResult: data,
            variables: variables,
            document: query,
        };
    };
    QueryManager.prototype.broadcastQueries = function (forceResolvers) {
        var _this = this;
        if (forceResolvers === void 0) { forceResolvers = false; }
        this.onBroadcast();
        this.queries.forEach(function (info, id) {
            if (!info.invalidated || !info.listeners)
                return;
            info.listeners
                .filter(function (x) { return !!x; })
                .forEach(function (listener) {
                listener(_this.queryStore.get(id), info.newData, forceResolvers);
            });
        });
    };
    QueryManager.prototype.getLocalState = function () {
        return this.localState;
    };
    QueryManager.prototype.getObservableQueryPromises = function (includeStandby) {
        var _this = this;
        var observableQueryPromises = [];
        this.queries.forEach(function (_a, queryId) {
            var observableQuery = _a.observableQuery;
            if (!observableQuery)
                return;
            var fetchPolicy = observableQuery.options.fetchPolicy;
            observableQuery.resetLastResults();
            if (fetchPolicy !== 'cache-only' &&
                (includeStandby || fetchPolicy !== 'standby')) {
                observableQueryPromises.push(observableQuery.refetch());
            }
            _this.setQuery(queryId, function () { return ({ newData: null }); });
            _this.invalidate(true, queryId);
        });
        return observableQueryPromises;
    };
    QueryManager.prototype.fetchRequest = function (_a) {
        var _this = this;
        var requestId = _a.requestId, queryId = _a.queryId, document = _a.document, options = _a.options, fetchMoreForQueryId = _a.fetchMoreForQueryId;
        var variables = options.variables, context = options.context, _b = options.errorPolicy, errorPolicy = _b === void 0 ? 'none' : _b, fetchPolicy = options.fetchPolicy;
        var resultFromStore;
        var errorsFromStore;
        return new Promise(function (resolve, reject) {
            var obs;
            var updatedContext = {};
            var clientQuery = _this.localState.clientQuery(document);
            var serverQuery = _this.localState.serverQuery(document);
            if (serverQuery) {
                var operation = _this.buildOperationForLink(serverQuery, variables, tslib_1.__assign({}, context, { forceFetch: !_this.queryDeduplication }));
                updatedContext = operation.context;
                obs = apollo_link_1.execute(_this.deduplicator, operation);
            }
            else {
                updatedContext = _this.prepareContext(context);
                obs = Observable_1.Observable.of({ data: {} });
            }
            _this.fetchQueryRejectFns.set("fetchRequest:" + queryId, reject);
            var complete = false;
            var handlingNext = true;
            var subscriber = {
                next: function (result) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                    var updatedResult, lastRequestId;
                    return tslib_1.__generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                handlingNext = true;
                                updatedResult = result;
                                lastRequestId = this.getQuery(queryId).lastRequestId;
                                if (!(requestId >= (lastRequestId || 1))) return [3, 3];
                                if (!(clientQuery && apollo_utilities_1.hasDirectives(['client'], clientQuery))) return [3, 2];
                                return [4, this.localState
                                        .runResolvers({
                                        document: clientQuery,
                                        remoteResult: result,
                                        context: updatedContext,
                                        variables: variables,
                                    })
                                        .catch(function (error) {
                                        handlingNext = false;
                                        reject(error);
                                        return result;
                                    })];
                            case 1:
                                updatedResult = _a.sent();
                                _a.label = 2;
                            case 2:
                                if (fetchPolicy !== 'no-cache') {
                                    try {
                                        this.dataStore.markQueryResult(updatedResult, document, variables, fetchMoreForQueryId, errorPolicy === 'ignore' || errorPolicy === 'all');
                                    }
                                    catch (e) {
                                        handlingNext = false;
                                        reject(e);
                                        return [2];
                                    }
                                }
                                else {
                                    this.setQuery(queryId, function () { return ({
                                        newData: { result: updatedResult.data, complete: true },
                                    }); });
                                }
                                this.queryStore.markQueryResult(queryId, updatedResult, fetchMoreForQueryId);
                                this.invalidate(true, queryId, fetchMoreForQueryId);
                                this.broadcastQueries();
                                _a.label = 3;
                            case 3:
                                if (updatedResult.errors && errorPolicy === 'none') {
                                    handlingNext = false;
                                    reject(new ApolloError_1.ApolloError({
                                        graphQLErrors: updatedResult.errors,
                                    }));
                                    return [2];
                                }
                                else if (errorPolicy === 'all') {
                                    errorsFromStore = updatedResult.errors;
                                }
                                if (fetchMoreForQueryId || fetchPolicy === 'no-cache') {
                                    resultFromStore = updatedResult.data;
                                }
                                else {
                                    try {
                                        resultFromStore = this.dataStore.getCache().read({
                                            variables: variables,
                                            query: document,
                                            optimistic: false,
                                        });
                                    }
                                    catch (e) { }
                                }
                                handlingNext = false;
                                if (complete) {
                                    subscriber.complete();
                                }
                                return [2];
                        }
                    });
                }); },
                error: function (error) {
                    _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
                    _this.setQuery(queryId, function (_a) {
                        var subscriptions = _a.subscriptions;
                        return ({
                            subscriptions: subscriptions.filter(function (x) { return x !== subscription; }),
                        });
                    });
                    reject(error);
                },
                complete: function () {
                    if (!handlingNext) {
                        _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
                        _this.setQuery(queryId, function (_a) {
                            var subscriptions = _a.subscriptions;
                            return ({
                                subscriptions: subscriptions.filter(function (x) { return x !== subscription; }),
                            });
                        });
                        resolve({
                            data: resultFromStore,
                            errors: errorsFromStore,
                            loading: false,
                            networkStatus: networkStatus_1.NetworkStatus.ready,
                            stale: false,
                        });
                    }
                    complete = true;
                },
            };
            var subscription = obs.subscribe(subscriber);
            _this.setQuery(queryId, function (_a) {
                var subscriptions = _a.subscriptions;
                return ({
                    subscriptions: subscriptions.concat([subscription]),
                });
            });
        }).catch(function (error) {
            _this.fetchQueryRejectFns.delete("fetchRequest:" + queryId);
            throw error;
        });
    };
    QueryManager.prototype.refetchQueryByName = function (queryName) {
        var _this = this;
        var refetchedQueries = this.queryIdsByName[queryName];
        if (refetchedQueries === undefined)
            return;
        return Promise.all(refetchedQueries
            .map(function (id) { return _this.getQuery(id).observableQuery; })
            .filter(function (x) { return !!x; })
            .map(function (x) { return x.refetch(); }));
    };
    QueryManager.prototype.generateRequestId = function () {
        var requestId = this.idCounter;
        this.idCounter++;
        return requestId;
    };
    QueryManager.prototype.getQuery = function (queryId) {
        return (this.queries.get(queryId) || {
            listeners: [],
            invalidated: false,
            document: null,
            newData: null,
            lastRequestId: null,
            observableQuery: null,
            subscriptions: [],
        });
    };
    QueryManager.prototype.setQuery = function (queryId, updater) {
        var prev = this.getQuery(queryId);
        var newInfo = tslib_1.__assign({}, prev, updater(prev));
        this.queries.set(queryId, newInfo);
    };
    QueryManager.prototype.invalidate = function (invalidated, queryId, fetchMoreForQueryId) {
        if (queryId)
            this.setQuery(queryId, function () { return ({ invalidated: invalidated }); });
        if (fetchMoreForQueryId) {
            this.setQuery(fetchMoreForQueryId, function () { return ({ invalidated: invalidated }); });
        }
    };
    QueryManager.prototype.buildOperationForLink = function (document, variables, extraContext) {
        var cache = this.dataStore.getCache();
        return {
            query: cache.transformForLink
                ? cache.transformForLink(document)
                : document,
            variables: variables,
            operationName: apollo_utilities_1.getOperationName(document) || undefined,
            context: this.prepareContext(extraContext),
        };
    };
    QueryManager.prototype.prepareContext = function (context) {
        if (context === void 0) { context = {}; }
        var newContext = this.localState.prepareContext(context);
        return tslib_1.__assign({}, newContext, { clientAwareness: this.clientAwareness });
    };
    QueryManager.prototype.checkInFlight = function (queryId) {
        var query = this.queryStore.get(queryId);
        return (query &&
            query.networkStatus !== networkStatus_1.NetworkStatus.ready &&
            query.networkStatus !== networkStatus_1.NetworkStatus.error);
    };
    QueryManager.prototype.startPollingQuery = function (options, queryId, listener) {
        var pollInterval = options.pollInterval;
        ts_invariant_1.invariant(pollInterval, 'Attempted to start a polling query without a polling interval.');
        if (!this.ssrMode) {
            this.pollingInfoByQueryId.set(queryId, {
                interval: pollInterval,
                lastPollTimeMs: Date.now() - 10,
                options: tslib_1.__assign({}, options, { fetchPolicy: 'network-only' }),
            });
            if (listener) {
                this.addQueryListener(queryId, listener);
            }
            this.schedulePoll(pollInterval);
        }
        return queryId;
    };
    QueryManager.prototype.stopPollingQuery = function (queryId) {
        this.pollingInfoByQueryId.delete(queryId);
    };
    QueryManager.prototype.schedulePoll = function (timeLimitMs) {
        var _this = this;
        var now = Date.now();
        if (this.nextPoll) {
            if (timeLimitMs < this.nextPoll.time - now) {
                clearTimeout(this.nextPoll.timeout);
            }
            else {
                return;
            }
        }
        this.nextPoll = {
            time: now + timeLimitMs,
            timeout: setTimeout(function () {
                _this.nextPoll = null;
                var nextTimeLimitMs = Infinity;
                _this.pollingInfoByQueryId.forEach(function (info, queryId) {
                    if (info.interval < nextTimeLimitMs) {
                        nextTimeLimitMs = info.interval;
                    }
                    if (!_this.checkInFlight(queryId)) {
                        if (Date.now() - info.lastPollTimeMs >= info.interval) {
                            var updateLastPollTime = function () {
                                info.lastPollTimeMs = Date.now();
                            };
                            _this.fetchQuery(queryId, info.options, types_1.FetchType.poll).then(updateLastPollTime, updateLastPollTime);
                        }
                    }
                });
                if (isFinite(nextTimeLimitMs)) {
                    _this.schedulePoll(nextTimeLimitMs);
                }
            }, timeLimitMs),
        };
    };
    return QueryManager;
}());
exports.QueryManager = QueryManager;
//# sourceMappingURL=QueryManager.js.map
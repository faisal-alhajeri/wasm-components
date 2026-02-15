"use jco";
export function instantiate(getCoreModule, imports, instantiateCore = (module, importObject) => new WebAssembly.Instance(module, importObject)) {
  
  const _debugLog = (...args) => {
    if (!globalThis?.process?.env?.JCO_DEBUG) { return; }
    console.debug(...args);
  }
  const ASYNC_DETERMINISM = 'random';
  
  class GlobalComponentAsyncLowers {
    static map = new Map();
    
    constructor() { throw new Error('GlobalComponentAsyncLowers should not be constructed'); }
    
    static define(args) {
      const { componentIdx, qualifiedImportFn, fn } = args;
      let inner = GlobalComponentAsyncLowers.map.get(componentIdx);
      if (!inner) {
        inner = new Map();
        GlobalComponentAsyncLowers.map.set(componentIdx, inner);
      }
      
      inner.set(qualifiedImportFn, fn);
    }
    
    static lookup(componentIdx, qualifiedImportFn) {
      let inner = GlobalComponentAsyncLowers.map.get(componentIdx);
      if (!inner) {
        inner = new Map();
        GlobalComponentAsyncLowers.map.set(componentIdx, inner);
      }
      
      const found = inner.get(qualifiedImportFn);
      if (found) { return found; }
      
      // In some cases, async lowers are *not* host provided, and
      // but contain/will call an async function in the host.
      //
      // One such case is `stream.write`/`stream.read` trampolines which are
      // actually re-exported through a patch up container *before*
      // they call the relevant async host trampoline.
      //
      // So the path of execution from a component export would be:
      //
      // async guest export --> stream.write import (host wired) -> guest export (patch component) -> async host trampoline
      //
      // On top of all this, the trampoline that is eventually called is async,
      // so we must await the patched guest export call.
      //
      if (qualifiedImportFn.includes("[stream-write-") || qualifiedImportFn.includes("[stream-read-")) {
        return async (...args) => {
          const [originalFn, ...params] = args;
          return await originalFn(...params);
        };
      }
      
      // All other cases can call the registered function directly
      return (...args) => {
        const [originalFn, ...params] = args;
        return originalFn(...params);
      };
    }
  }
  
  class GlobalAsyncParamLowers {
    static map = new Map();
    
    static generateKey(args) {
      const { componentIdx, iface, fnName } = args;
      if (componentIdx === undefined) { throw new TypeError("missing component idx"); }
      if (iface === undefined) { throw new TypeError("missing iface name"); }
      if (fnName === undefined) { throw new TypeError("missing function name"); }
      return `${componentIdx}-${iface}-${fnName}`;
    }
    
    static define(args) {
      const { componentIdx, iface, fnName, fn } = args;
      if (!fn) { throw new TypeError('missing function'); }
      const key = GlobalAsyncParamLowers.generateKey(args);
      GlobalAsyncParamLowers.map.set(key, fn);
    }
    
    static lookup(args) {
      const { componentIdx, iface, fnName } = args;
      const key = GlobalAsyncParamLowers.generateKey(args);
      return GlobalAsyncParamLowers.map.get(key);
    }
  }
  
  class GlobalComponentMemories {
    static map = new Map();
    
    constructor() { throw new Error('GlobalComponentMemories should not be constructed'); }
    
    static save(args) {
      const { idx, componentIdx, memory } = args;
      let inner = GlobalComponentMemories.map.get(componentIdx);
      if (!inner) {
        inner = [];
        GlobalComponentMemories.map.set(componentIdx, inner);
      }
      inner.push({ memory, idx });
    }
    
    static getMemoriesForComponentIdx(componentIdx) {
      const metas = GlobalComponentMemories.map.get(componentIdx);
      return metas.map(meta => meta.memory);
    }
    
    static getMemory(componentIdx, idx) {
      const metas = GlobalComponentMemories.map.get(componentIdx);
      return metas.find(meta => meta.idx === idx)?.memory;
    }
  }
  
  class RepTable {
    #data = [0, null];
    #target;
    
    constructor(args) {
      this.target = args?.target;
    }
    
    insert(val) {
      _debugLog('[RepTable#insert()] args', { val, target: this.target });
      const freeIdx = this.#data[0];
      if (freeIdx === 0) {
        this.#data.push(val);
        this.#data.push(null);
        return (this.#data.length >> 1) - 1;
      }
      this.#data[0] = this.#data[freeIdx << 1];
      const placementIdx = freeIdx << 1;
      this.#data[placementIdx] = val;
      this.#data[placementIdx + 1] = null;
      return freeIdx;
    }
    
    get(rep) {
      _debugLog('[RepTable#get()] args', { rep, target: this.target });
      const baseIdx = rep << 1;
      const val = this.#data[baseIdx];
      return val;
    }
    
    contains(rep) {
      _debugLog('[RepTable#contains()] args', { rep, target: this.target });
      const baseIdx = rep << 1;
      return !!this.#data[baseIdx];
    }
    
    remove(rep) {
      _debugLog('[RepTable#remove()] args', { rep, target: this.target });
      if (this.#data.length === 2) { throw new Error('invalid'); }
      
      const baseIdx = rep << 1;
      const val = this.#data[baseIdx];
      if (val === 0) { throw new Error('invalid resource rep (cannot be 0)'); }
      
      this.#data[baseIdx] = this.#data[0];
      this.#data[0] = rep;
      
      return val;
    }
    
    clear() {
      _debugLog('[RepTable#clear()] args', { rep, target: this.target });
      this.#data = [0, null];
    }
  }
  const _coinFlip = () => { return Math.random() > 0.5; };
  let SCOPE_ID = 0;
  const I32_MIN = -2_147_483_648;
  const I32_MAX = 2_147_483_647;
  const _typeCheckValidI32 = (n) => typeof n === 'number' && n >= I32_MIN && n <= I32_MAX;
  
  const _typeCheckAsyncFn= (f) => {
    return f instanceof ASYNC_FN_CTOR;
  };
  
  const ASYNC_FN_CTOR = (async () => {}).constructor;
  const ASYNC_CURRENT_TASK_IDS = [];
  const ASYNC_CURRENT_COMPONENT_IDXS = [];
  
  function unpackCallbackResult(result) {
    _debugLog('[unpackCallbackResult()] args', { result });
    if (!(_typeCheckValidI32(result))) { throw new Error('invalid callback return value [' + result + '], not a valid i32'); }
    const eventCode = result & 0xF;
    if (eventCode < 0 || eventCode > 3) {
      throw new Error('invalid async return value [' + eventCode + '], outside callback code range');
    }
    if (result < 0 || result >= 2**32) { throw new Error('invalid callback result'); }
    // TODO: table max length check?
    const waitableSetRep = result >> 4;
    return [eventCode, waitableSetRep];
  }
  
  function promiseWithResolvers() {
    if (Promise.withResolvers) {
      return Promise.withResolvers();
    } else {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
  }
  
  function _prepareCall(
  memoryIdx,
  getMemoryFn,
  startFn,
  returnFn,
  callerInstanceIdx,
  calleeInstanceIdx,
  taskReturnTypeIdx,
  isCalleeAsyncInt,
  stringEncoding,
  resultCountOrAsync,
  ) {
    _debugLog('[_prepareCall()]', {
      callerInstanceIdx,
      calleeInstanceIdx,
      taskReturnTypeIdx,
      isCalleeAsyncInt,
      stringEncoding,
      resultCountOrAsync,
    });
    const argArray = [...arguments];
    
    // Since Rust will happily pass large u32s over, resultCountOrAsync should be one of:
    // (a) u32 max size     => callee is async fn with no result
    // (b) u32 max size - 1 => callee is async fn with result
    // (c) any other value  => callee is sync with the given result count
    //
    // Due to JS handling the value as 2s complement, the `resultCountOrAsync` ends up being:
    // (a) -1 as u32 max size
    // (b) -2 as u32 max size - 1
    // (c) x
    //
    // Due to JS mishandling the value as 2s complement, the actual values we get are:
    // see. https://github.com/wasm-bindgen/wasm-bindgen/issues/1388
    let isAsync = false;
    let hasResultPointer = false;
    if (resultCountOrAsync === -1) {
      isAsync = true;
      hasResultPointer = false;
    } else if (resultCountOrAsync === -2) {
      isAsync = true;
      hasResultPointer = true;
    }
    
    const currentCallerTaskMeta = getCurrentTask(callerInstanceIdx);
    if (!currentCallerTaskMeta) {
      throw new Error('invalid/missing current task for caller during prepare call');
    }
    
    const currentCallerTask = currentCallerTaskMeta.task;
    if (!currentCallerTask) {
      throw new Error('unexpectedly missing task in meta for caller during prepare call');
    }
    
    if (currentCallerTask.componentIdx() !== callerInstanceIdx) {
      throw new Error(`task component idx [${ currentCallerTask.componentIdx() }] !== [${ callerInstanceIdx }] (callee ${ calleeInstanceIdx })`);
    }
    
    let getCalleeParamsFn;
    let resultPtr = null;
    if (hasResultPointer) {
      const directParamsArr = argArray.slice(11);
      getCalleeParamsFn = () => directParamsArr;
      resultPtr = argArray[10];
    } else {
      const directParamsArr = argArray.slice(10);
      getCalleeParamsFn = () => directParamsArr;
    }
    
    let encoding;
    switch (stringEncoding) {
      case 0:
      encoding = 'utf8';
      break;
      case 1:
      encoding = 'utf16';
      break;
      case 2:
      encoding = 'compact-utf16';
      break;
      default:
      throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
    }
    
    const [newTask, newTaskID] = createNewCurrentTask({
      componentIdx: calleeInstanceIdx,
      isAsync: isCalleeAsyncInt !== 0,
      getCalleeParamsFn,
      // TODO: find a way to pass the import name through here
      entryFnName: 'task/' + currentCallerTask.id() + '/new-prepare-task',
      stringEncoding,
    });
    
    const subtask = currentCallerTask.createSubtask({
      componentIdx: callerInstanceIdx,
      parentTask: currentCallerTask,
      childTask: newTask,
      callMetadata: {
        memory: getMemoryFn(),
        memoryIdx,
        resultPtr,
        returnFn,
        startFn,
      }
    });
    
    newTask.setParentSubtask(subtask);
    // NOTE: This isn't really a return memory idx for the caller, it's for checking
    // against the task.return (which will be called from the callee)
    newTask.setReturnMemoryIdx(memoryIdx);
  }
  
  function _asyncStartCall(args, callee, paramCount, resultCount, flags) {
    const { getCallbackFn, callbackIdx, getPostReturnFn, postReturnIdx } = args;
    _debugLog('[_asyncStartCall()] args', args);
    
    const taskMeta = getCurrentTask(ASYNC_CURRENT_COMPONENT_IDXS.at(-1), ASYNC_CURRENT_TASK_IDS.at(-1));
    if (!taskMeta) { throw new Error('invalid/missing current async task meta during prepare call'); }
    
    const argArray = [...arguments];
    
    // NOTE: at this point we know the current task is the one that was started
    // in PrepareCall, so we *should* be able to pop it back off and be left with
    // the previous task
    const preparedTask = taskMeta.task;
    if (!preparedTask) { throw new Error('unexpectedly missing task in task meta during prepare call'); }
    
    if (resultCount < 0 || resultCount > 1) { throw new Error('invalid/unsupported result count'); }
    
    const callbackFnName = 'callback_' + callbackIdx;
    const callbackFn = getCallbackFn();
    preparedTask.setCallbackFn(callbackFn, callbackFnName);
    preparedTask.setPostReturnFn(getPostReturnFn());
    
    const subtask = preparedTask.getParentSubtask();
    
    if (resultCount < 0 || resultCount > 1) { throw new Error(`unsupported result count [${ resultCount }]`); }
    
    const params = preparedTask.getCalleeParams();
    if (paramCount !== params.length) {
      throw new Error(`unexpected callee param count [${ params.length }], _asyncStartCall invocation expected [${ paramCount }]`);
    }
    
    subtask.setOnProgressFn(() => {
      subtask.setPendingEventFn(() => {
        if (subtask.resolved()) { subtask.deliverResolve(); }
        return {
          code: ASYNC_EVENT_CODE.SUBTASK,
          index: rep,
          result: subtask.getStateNumber(),
        }
      });
    });
    
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState > 2**5) {
      throw new Error('invalid subtask state, out of valid range');
    }
    
    const callerComponentState = getOrCreateAsyncState(subtask.componentIdx());
    const rep = callerComponentState.subtasks.insert(subtask);
    subtask.setRep(rep);
    
    const calleeComponentState = getOrCreateAsyncState(preparedTask.componentIdx());
    const calleeBackpressure = calleeComponentState.hasBackpressure();
    
    // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
    //
    // NOTE: during fused guest->guest calls this handler is triggered, but does not actually perform
    // lowering manually, as fused modules provider helper functions that can
    subtask.registerOnResolveHandler((res) => {
      _debugLog('[_asyncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });
      let subtaskCallMeta = subtask.getCallMetadata();
      
      // NOTE: in the case of guest -> guest async calls, there may be no memory/realloc present,
      // as the host will intermediate the value storage/movement between calls.
      //
      // We can simply take the value and lower it as a parameter
      if (subtaskCallMeta.memory || subtaskCallMeta.realloc) {
        throw new Error("call metadata unexpectedly contains memory/realloc for guest->guest call");
      }
      
      const callerTask = subtask.getParentTask();
      const calleeTask = preparedTask;
      const callerMemoryIdx = callerTask.getReturnMemoryIdx();
      const callerComponentIdx = callerTask.componentIdx();
      
      // If a helper function was provided we are likely in a fused guest->guest call,
      // and the result will be delivered (lift/lowered) via helper function
      if (subtaskCallMeta.returnFn) {
        _debugLog('[_asyncStartCall()] return function present while ahndling subtask result, returning early (skipping lower)');
        return;
      }
      
      // If there is no where to lower the results, exit early
      if (!subtaskCallMeta.resultPtr) {
        _debugLog('[_asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)');
        return;
      }
      
      let callerMemory;
      if (callerMemoryIdx) {
        callerMemory = GlobalComponentMemories.getMemory(callerComponentIdx, callerMemoryIdx);
      } else {
        const callerMemories = GlobalComponentMemories.getMemoriesForComponentIdx(callerComponentIdx);
        if (callerMemories.length != 1) { throw new Error(`unsupported amount of caller memories`); }
        callerMemory = callerMemories[0];
      }
      
      if (!callerMemory) {
        throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
      }
      
      const lowerFns = calleeTask.getReturnLowerFns();
      if (!lowerFns || lowerFns.length === 0) {
        throw new Error(`missing result lower metadata for guest->guests call (subtask [${subtask.id()}])`);
      }
      
      if (lowerFns.length !== 1) {
        throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
      }
      
      lowerFns[0]({
        realloc: undefined,
        memory: callerMemory,
        vals: [res],
        storagePtr: subtaskCallMeta.resultPtr,
        componentIdx: callerComponentIdx
      });
      
    });
    
    // Build call params
    const subtaskCallMeta = subtask.getCallMetadata();
    let startFnParams = [];
    let calleeParams = [];
    if (subtaskCallMeta.startFn && subtaskCallMeta.resultPtr) {
      // If we're using a fused component start fn  and a result pointer is present,
      // then we need to pass the result pointer and other params to the start fn
      startFnParams.push(subtaskCallMeta.resultPtr, ...params);
    } else {
      // if not we need to pass params to the callee instead
      startFnParams.push(...params);
      calleeParams.push(...params);
    }
    
    preparedTask.registerOnResolveHandler((res) => {
      _debugLog('[_asyncStartCall()] signaling subtask completion due to task completion', {
        childTaskID: preparedTask.id(),
        subtaskID: subtask.id(),
        parentTaskID: subtask.getParentTask().id(),
      });
      subtask.onResolve(res);
    });
    
    // TODO(fix): start fns sometimes produce results, how should they be used?
    // the result should theoretically be used for flat lowering, but fused components do
    // this automatically!
    subtask.onStart({ startFnParams });
    
    _debugLog("[_asyncStartCall()] initial call", {
      task: preparedTask.id(),
      subtaskID: subtask.id(),
      calleeFnName: callee.name,
    });
    
    const callbackResult = callee.apply(null, calleeParams);
    
    _debugLog("[_asyncStartCall()] after initial call", {
      task: preparedTask.id(),
      subtaskID: subtask.id(),
      calleeFnName: callee.name,
    });
    
    const doSubtaskResolve = () => {
      subtask.deliverResolve();
    };
    
    // If a single call resolved the subtask and there is no backpressure in the guest,
    // we can return immediately
    if (subtask.resolved() && !calleeBackpressure) {
      _debugLog("[_asyncStartCall()] instantly resolved", {
        calleeComponentIdx: preparedTask.componentIdx(),
        task: preparedTask.id(),
        subtaskID: subtask.id(),
        callerComponentIdx: subtask.componentIdx(),
      });
      
      // If a fused component return function was specified for the subtask,
      // we've likely already called it during resolution of the task.
      //
      // In this case, we do not want to actually return 2 AKA "RETURNED",
      // but the normal started task state, because the fused component expects to get
      // the waitable + the original subtask state (0 AKA "STARTING")
      //
      if (subtask.getCallMetadata().returnFn) {
        return Number(subtask.waitableRep()) << 4 | subtaskState;
      }
      
      doSubtaskResolve();
      return AsyncSubtask.State.RETURNED;
    }
    
    // Start the (event) driver loop that will resolve the task
    new Promise(async (resolve, reject) => {
      if (subtask.resolved() && calleeBackpressure) {
        await calleeComponentState.waitForBackpressure();
        
        _debugLog("[_asyncStartCall()] instantly resolved after cleared backpressure", {
          calleeComponentIdx: preparedTask.componentIdx(),
          task: preparedTask.id(),
          subtaskID: subtask.id(),
          callerComponentIdx: subtask.componentIdx(),
        });
        return;
      }
      
      const started = await preparedTask.enter();
      if (!started) {
        _debugLog('[_asyncStartCall()] task failed early', {
          taskID: preparedTask.id(),
          subtaskID: subtask.id(),
        });
        throw new Error("task failed to start");
        return;
      }
      
      // TODO: retrieve/pass along actual fn name the callback corresponds to
      // (at least something like `<lifted fn name>_callback`)
      const fnName = [
      '<task ',
      subtask.parentTaskID(),
      '/subtask ',
      subtask.id(),
      '/task ',
      preparedTask.id(),
      '>',
      ].join("");
      
      try {
        _debugLog("[_asyncStartCall()] starting driver loop", { fnName, componentIdx: preparedTask.componentIdx(), });
        await _driverLoop({
          componentState: calleeComponentState,
          task: preparedTask,
          fnName,
          isAsync: true,
          callbackResult,
          resolve,
          reject
        });
      } catch (err) {
        _debugLog("[AsyncStartCall] drive loop call failure", { err });
      }
      
    });
    
    return Number(subtask.waitableRep()) << 4 | subtaskState;
  }
  
  function _syncStartCall(callbackIdx) {
    _debugLog('[_syncStartCall()] args', { callbackIdx });
    throw new Error('synchronous start call not implemented!');
  }
  
  const emptyFunc = () => {};
  
  let dv = new DataView(new ArrayBuffer());
  const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
  
  function toUint32(val) {
    return val >>> 0;
  }
  const TEXT_DECODER_UTF8 = new TextDecoder();
  
  const T_FLAG = 1 << 30;
  
  function rscTableRemove(table, handle) {
    const scope = table[handle << 1];
    const val = table[(handle << 1) + 1];
    const own = (val & T_FLAG) !== 0;
    const rep = val & ~T_FLAG;
    if (val === 0 || (scope & T_FLAG) !== 0) {
      throw new TypeError("Invalid handle");
    }
    table[handle << 1] = table[0] | T_FLAG;
    table[0] = handle | T_FLAG;
    return { rep, scope, own };
  }
  
  function getCurrentTask(componentIdx) {
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index [' + componentIdx + '] while getting current task');
    }
    const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (tasks === undefined) { return undefined; }
    if (tasks.length === 0) { return undefined; }
    return tasks[tasks.length - 1];
  }
  
  function createNewCurrentTask(args) {
    _debugLog('[createNewCurrentTask()] args', args);
    const {
      componentIdx,
      isAsync,
      entryFnName,
      parentSubtaskID,
      callbackFnName,
      getCallbackFn,
      getParamsFn,
      stringEncoding,
      errHandling,
      getCalleeParamsFn,
      resultPtr,
      callingWasmExport,
    } = args;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while starting task');
    }
    const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    const callbackFn = getCallbackFn ? getCallbackFn() : null;
    
    const newTask = new AsyncTask({
      componentIdx,
      isAsync,
      entryFnName,
      callbackFn,
      callbackFnName,
      stringEncoding,
      getCalleeParamsFn,
      resultPtr,
      errHandling,
    });
    
    const newTaskID = newTask.id();
    const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
    
    ASYNC_CURRENT_TASK_IDS.push(newTaskID);
    ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
    
    if (!taskMetas) {
      ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
    } else {
      taskMetas.push(newTaskMeta);
    }
    
    return [newTask, newTaskID];
  }
  
  function endCurrentTask(componentIdx, taskID) {
    componentIdx ??= ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
    taskID ??= ASYNC_CURRENT_TASK_IDS.at(-1);
    _debugLog('[endCurrentTask()] args', { componentIdx, taskID });
    
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while ending current task');
    }
    
    const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('missing/invalid tasks for component instance while ending task');
    }
    if (tasks.length == 0) {
      throw new Error('no current task(s) for component instance while ending task');
    }
    
    if (taskID) {
      const last = tasks[tasks.length - 1];
      if (last.id !== taskID) {
        // throw new Error('current task does not match expected task ID');
        return;
      }
    }
    
    ASYNC_CURRENT_TASK_IDS.pop();
    ASYNC_CURRENT_COMPONENT_IDXS.pop();
    
    const taskMeta = tasks.pop();
    return taskMeta.task;
  }
  const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();
  
  class AsyncTask {
    static _ID = 0n;
    
    static State = {
      INITIAL: 'initial',
      CANCELLED: 'cancelled',
      CANCEL_PENDING: 'cancel-pending',
      CANCEL_DELIVERED: 'cancel-delivered',
      RESOLVED: 'resolved',
    }
    
    static BlockResult = {
      CANCELLED: 'block.cancelled',
      NOT_CANCELLED: 'block.not-cancelled',
    }
    
    #id;
    #componentIdx;
    #state;
    #isAsync;
    #entryFnName = null;
    #subtasks = [];
    
    #onResolveHandlers = [];
    #completionPromise = null;
    
    #memoryIdx = null;
    
    #callbackFn = null;
    #callbackFnName = null;
    
    #postReturnFn = null;
    
    #getCalleeParamsFn = null;
    
    #stringEncoding = null;
    
    #parentSubtask = null;
    
    #needsExclusiveLock = false;
    
    #errHandling;
    
    #backpressurePromise;
    #backpressureWaiters = 0n;
    
    #returnLowerFns = null;
    
    cancelled = false;
    requested = false;
    alwaysTaskReturn = false;
    
    returnCalls =  0;
    storage = [0, 0];
    borrowedHandles = {};
    
    awaitableResume = null;
    awaitableCancel = null;
    
    constructor(opts) {
      this.#id = ++AsyncTask._ID;
      
      if (opts?.componentIdx === undefined) {
        throw new TypeError('missing component id during task creation');
      }
      this.#componentIdx = opts.componentIdx;
      
      this.#state = AsyncTask.State.INITIAL;
      this.#isAsync = opts?.isAsync ?? false;
      this.#entryFnName = opts.entryFnName;
      
      const {
        promise: completionPromise,
        resolve: resolveCompletionPromise,
        reject: rejectCompletionPromise,
      } = promiseWithResolvers();
      this.#completionPromise = completionPromise;
      
      this.#onResolveHandlers.push((results) => {
        resolveCompletionPromise(results);
      })
      
      if (opts.callbackFn) { this.#callbackFn = opts.callbackFn; }
      if (opts.callbackFnName) { this.#callbackFnName = opts.callbackFnName; }
      
      if (opts.getCalleeParamsFn) { this.#getCalleeParamsFn = opts.getCalleeParamsFn; }
      
      if (opts.stringEncoding) { this.#stringEncoding = opts.stringEncoding; }
      
      if (opts.parentSubtask) { this.#parentSubtask = opts.parentSubtask; }
      
      this.#needsExclusiveLock = this.isSync() || !this.hasCallback();
      
      if (opts.errHandling) { this.#errHandling = opts.errHandling; }
    }
    
    taskState() { return this.#state; }
    id() { return this.#id; }
    componentIdx() { return this.#componentIdx; }
    isAsync() { return this.#isAsync; }
    entryFnName() { return this.#entryFnName; }
    completionPromise() { return this.#completionPromise; }
    
    isAsync() { return this.#isAsync; }
    isSync() { return !this.isAsync(); }
    
    getErrHandling() { return this.#errHandling; }
    
    hasCallback() { return this.#callbackFn !== null; }
    
    setReturnMemoryIdx(idx) { this.#memoryIdx = idx; }
    getReturnMemoryIdx() { return this.#memoryIdx; }
    
    setReturnLowerFns(fns) { this.#returnLowerFns = fns; }
    getReturnLowerFns() { return this.#returnLowerFns; }
    
    setParentSubtask(subtask) {
      if (!subtask || !(subtask instanceof AsyncSubtask)) { return }
      if (this.#parentSubtask) { throw new Error('parent subtask can only be set once'); }
      this.#parentSubtask = subtask;
    }
    
    getParentSubtask() { return this.#parentSubtask; }
    
    // TODO(threads): this is very inefficient, we can pass along a root task,
    // and ideally do not need this once thread support is in place
    getRootTask() {
      let currentSubtask = this.getParentSubtask();
      let task = this;
      while (currentSubtask) {
        task = currentSubtask.getParentTask();
        currentSubtask = task.getParentSubtask();
      }
      return task;
    }
    
    setPostReturnFn(f) {
      if (!f) { return; }
      if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
      this.#postReturnFn = f;
    }
    
    setCallbackFn(f, name) {
      if (!f) { return; }
      if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
      this.#callbackFn = f;
      this.#callbackFnName = name;
    }
    
    getCallbackFnName() {
      if (!this.#callbackFnName) { return undefined; }
      return this.#callbackFnName;
    }
    
    runCallbackFn(...args) {
      if (!this.#callbackFn) { throw new Error('on callback function has been set for task'); }
      return this.#callbackFn.apply(null, args);
    }
    
    getCalleeParams() {
      if (!this.#getCalleeParamsFn) { throw new Error('missing/invalid getCalleeParamsFn'); }
      return this.#getCalleeParamsFn();
    }
    
    mayEnter(task) {
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      if (cstate.hasBackpressure()) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
        return false;
      }
      if (!cstate.callingSyncImport()) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
        return false;
      }
      const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
      if (!callingSyncExportWithSyncPending) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', { taskID: this.#id });
        return false;
      }
      return true;
    }
    
    async enter() {
      _debugLog('[AsyncTask#enter()] args', { taskID: this.#id });
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      
      if (this.isSync()) { return true; }
      
      if (cstate.hasBackpressure()) {
        cstate.addBackpressureWaiter();
        
        const result = await this.waitUntil({
          readyFn: () => !cstate.hasBackpressure(),
          cancellable: true,
        });
        
        cstate.removeBackpressureWaiter();
        
        if (result === AsyncTask.BlockResult.CANCELLED) {
          this.cancel();
          return false;
        }
      }
      
      if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
      
      return true;
    }
    
    isRunning() {
      return this.#state !== AsyncTask.State.RESOLVED;
    }
    
    async waitUntil(opts) {
      const { readyFn, waitableSetRep, cancellable } = opts;
      _debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, waitableSetRep, cancellable });
      
      const state = getOrCreateAsyncState(this.#componentIdx);
      const wset = state.waitableSets.get(waitableSetRep);
      
      let event;
      
      wset.incrementNumWaiting();
      
      const keepGoing = await this.suspendUntil({
        readyFn: () => {
          const hasPendingEvent = wset.hasPendingEvent();
          return readyFn() && hasPendingEvent;
        },
        cancellable,
      });
      
      if (keepGoing) {
        event = wset.getPendingEvent();
      } else {
        event = {
          code: ASYNC_EVENT_CODE.TASK_CANCELLED,
          index: 0,
          result: 0,
        };
      }
      
      wset.decrementNumWaiting();
      
      return event;
    }
    
    async onBlock(awaitable) {
      _debugLog('[AsyncTask#onBlock()] args', { taskID: this.#id, awaitable });
      if (!(awaitable instanceof Awaitable)) {
        throw new Error('invalid awaitable during onBlock');
      }
      
      // Build a promise that this task can await on which resolves when it is awoken
      const { promise, resolve, reject } = promiseWithResolvers();
      this.awaitableResume = () => {
        _debugLog('[AsyncTask] resuming after onBlock', { taskID: this.#id });
        resolve();
      };
      this.awaitableCancel = (err) => {
        _debugLog('[AsyncTask] rejecting after onBlock', { taskID: this.#id, err });
        reject(err);
      };
      
      // Park this task/execution to be handled later
      const state = getOrCreateAsyncState(this.#componentIdx);
      state.parkTaskOnAwaitable({ awaitable, task: this });
      
      try {
        await promise;
        return AsyncTask.BlockResult.NOT_CANCELLED;
      } catch (err) {
        // rejection means task cancellation
        return AsyncTask.BlockResult.CANCELLED;
      }
    }
    
    async asyncOnBlock(awaitable) {
      _debugLog('[AsyncTask#asyncOnBlock()] args', { taskID: this.#id, awaitable });
      if (!(awaitable instanceof Awaitable)) {
        throw new Error('invalid awaitable during onBlock');
      }
      // TODO: watch for waitable AND cancellation
      // TODO: if it WAS cancelled:
      // - return true
      // - only once per subtask
      // - do not wait on the scheduler
      // - control flow should go to the subtask (only once)
      // - Once subtask blocks/resolves, reqlinquishControl() will tehn resolve request_cancel_end (without scheduler lock release)
      // - control flow goes back to request_cancel
      //
      // Subtask cancellation should work similarly to an async import call -- runs sync up until
      // the subtask blocks or resolves
      //
      throw new Error('AsyncTask#asyncOnBlock() not yet implemented');
    }
    
    async yieldUntil(opts) {
      const { readyFn, cancellable } = opts;
      _debugLog('[AsyncTask#yieldUntil()] args', { taskID: this.#id, cancellable });
      
      const keepGoing = await this.suspendUntil({ readyFn, cancellable });
      if (!keepGoing) {
        return {
          code: ASYNC_EVENT_CODE.TASK_CANCELLED,
          index: 0,
          result: 0,
        };
      }
      
      return {
        code: ASYNC_EVENT_CODE.NONE,
        index: 0,
        result: 0,
      };
    }
    
    async suspendUntil(opts) {
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#suspendUntil()] args', { cancellable });
      
      const pendingCancelled = this.deliverPendingCancel({ cancellable });
      if (pendingCancelled) { return false; }
      
      const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
      return completed;
    }
    
    // TODO(threads): equivalent to thread.suspend_until()
    async immediateSuspendUntil(opts) {
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#immediateSuspendUntil()] args', { cancellable, readyFn });
      
      const ready = readyFn();
      if (ready && !ASYNC_DETERMINISM && _coinFlip()) {
        return true;
      }
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      cstate.addPendingTask(this);
      
      const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
      return keepGoing;
    }
    
    async immediateSuspend(opts) { // NOTE: equivalent to thread.suspend()
    // TODO(threads): store readyFn on the thread
    const { cancellable, readyFn } = opts;
    _debugLog('[AsyncTask#immediateSuspend()] args', { cancellable, readyFn });
    
    const pendingCancelled = this.deliverPendingCancel({ cancellable });
    if (pendingCancelled) { return false; }
    
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    
    // TODO(fix): update this to tick until there is no more action to take.
    setTimeout(() => cstate.tick(), 0);
    
    const taskWait = await cstate.suspendTask({ task: this, readyFn });
    const keepGoing = await taskWait;
    return keepGoing;
  }
  
  deliverPendingCancel(opts) {
    const { cancellable } = opts;
    _debugLog('[AsyncTask#deliverPendingCancel()] args', { cancellable });
    
    if (cancellable && this.#state === AsyncTask.State.PENDING_CANCEL) {
      this.#state = Task.State.CANCEL_DELIVERED;
      return true;
    }
    
    return false;
  }
  
  isCancelled() { return this.cancelled }
  
  cancel() {
    _debugLog('[AsyncTask#cancel()] args', { });
    if (!this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
      throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] invalid task state for cancellation`);
    }
    if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
    this.cancelled = true;
    this.onResolve(new Error('cancelled'));
    this.#state = AsyncTask.State.RESOLVED;
  }
  
  onResolve(taskValue) {
    for (const f of this.#onResolveHandlers) {
      try {
        f(taskValue);
      } catch (err) {
        console.error("error during task resolve handler", err);
        throw err;
      }
    }
    
    if (this.#postReturnFn) {
      _debugLog('[AsyncTask#onResolve()] running post return ', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
      });
      this.#postReturnFn();
    }
  }
  
  registerOnResolveHandler(f) {
    this.#onResolveHandlers.push(f);
  }
  
  resolve(results) {
    _debugLog('[AsyncTask#resolve()] args', {
      results,
      componentIdx: this.#componentIdx,
      taskID: this.#id,
    });
    
    if (this.#state === AsyncTask.State.RESOLVED) {
      throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
    }
    if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
    switch (results.length) {
      case 0:
      this.onResolve(undefined);
      break;
      case 1:
      this.onResolve(results[0]);
      break;
      default:
      throw new Error('unexpected number of results');
    }
    this.#state = AsyncTask.State.RESOLVED;
  }
  
  exit() {
    _debugLog('[AsyncTask#exit()] args', { });
    
    // TODO: ensure there is only one task at a time (scheduler.lock() functionality)
    if (this.#state !== AsyncTask.State.RESOLVED) {
      // TODO(fix): only fused, manually specified post returns seem to break this invariant,
      // as the TaskReturn trampoline is not activated it seems.
      //
      // see: test/p3/ported/wasmtime/component-async/post-return.js
      //
      // We *should* be able to upgrade this to be more strict and throw at some point,
      // which may involve rewriting the upstream test to surface task return manually somehow.
      //
      //throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
      _debugLog('[AsyncTask#exit()] task exited without resolution', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        subtask: this.getParentSubtask(),
        subtaskID: this.getParentSubtask()?.id(),
      });
      this.#state = AsyncTask.State.RESOLVED;
    }
    
    if (this.borrowedHandles > 0) {
      throw new Error('task [${this.#id}] exited without clearing borrowed handles');
    }
    
    const state = getOrCreateAsyncState(this.#componentIdx);
    if (!state) { throw new Error('missing async state for component [' + this.#componentIdx + ']'); }
    if (!this.#isAsync && !state.inSyncExportCall) {
      throw new Error('sync task must be run from components known to be in a sync export call');
    }
    state.inSyncExportCall = false;
    
    if (this.needsExclusiveLock() && !state.isExclusivelyLocked()) {
      throw new Error('task [' + this.#id + '] exit: component [' + this.#componentIdx + '] should have been exclusively locked');
    }
    
    state.exclusiveRelease();
  }
  
  needsExclusiveLock() { return this.#needsExclusiveLock; }
  
  createSubtask(args) {
    _debugLog('[AsyncTask#createSubtask()] args', args);
    const { componentIdx, childTask, callMetadata } = args;
    const newSubtask = new AsyncSubtask({
      componentIdx,
      childTask,
      parentTask: this,
      callMetadata,
    });
    this.#subtasks.push(newSubtask);
    return newSubtask;
  }
  
  getLatestSubtask() { return this.#subtasks.at(-1); }
  
  currentSubtask() {
    _debugLog('[AsyncTask#currentSubtask()]');
    if (this.#subtasks.length === 0) { return undefined; }
    return this.#subtasks.at(-1);
  }
  
  endCurrentSubtask() {
    _debugLog('[AsyncTask#endCurrentSubtask()]');
    if (this.#subtasks.length === 0) { throw new Error('cannot end current subtask: no current subtask'); }
    const subtask = this.#subtasks.pop();
    subtask.drop();
    return subtask;
  }
}

function _lowerImport(args, exportFn) {
  const params = [...arguments].slice(2);
  _debugLog('[_lowerImport()] args', { args, params, exportFn });
  const {
    functionIdx,
    componentIdx,
    isAsync,
    paramLiftFns,
    resultLowerFns,
    metadata,
    memoryIdx,
    getMemoryFn,
    getReallocFn,
  } = args;
  
  const parentTaskMeta = getCurrentTask(componentIdx);
  const parentTask = parentTaskMeta?.task;
  if (!parentTask) { throw new Error('missing parent task during lower of import'); }
  
  const cstate = getOrCreateAsyncState(componentIdx);
  
  const subtask = parentTask.createSubtask({
    componentIdx,
    parentTask,
    callMetadata: {
      memoryIdx,
      memory: getMemoryFn(),
      realloc: getReallocFn(),
      resultPtr: params[0],
    }
  });
  parentTask.setReturnMemoryIdx(memoryIdx);
  
  const rep = cstate.subtasks.insert(subtask);
  subtask.setRep(rep);
  
  subtask.setOnProgressFn(() => {
    subtask.setPendingEventFn(() => {
      if (subtask.resolved()) { subtask.deliverResolve(); }
      return {
        code: ASYNC_EVENT_CODE.SUBTASK,
        index: rep,
        result: subtask.getStateNumber(),
      }
    });
  });
  
  // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
  subtask.registerOnResolveHandler((res) => {
    _debugLog('[_lowerImport()] handling subtask result', { res, subtaskID: subtask.id() });
    const { memory, resultPtr, realloc } = subtask.getCallMetadata();
    if (resultLowerFns.length === 0) { return; }
    resultLowerFns[0]({ componentIdx, memory, realloc, vals: [res], storagePtr: resultPtr });
  });
  
  const subtaskState = subtask.getStateNumber();
  if (subtaskState < 0 || subtaskState > 2**5) {
    throw new Error('invalid subtask state, out of valid range');
  }
  
  // NOTE: we must wait a bit before calling the export function,
  // to ensure the subtask state is not modified before the lower call return
  //
  // TODO: we should trigger via subtask state changing, rather than a static wait?
  setTimeout(async () => {
    try {
      _debugLog('[_lowerImport()] calling lowered import', { exportFn, params });
      exportFn.apply(null, params);
      
      const task = subtask.getChildTask();
      task.registerOnResolveHandler((res) => {
        _debugLog('[_lowerImport()] cascading subtask completion', {
          childTaskID: task.id(),
          subtaskID: subtask.id(),
          parentTaskID: parentTask.id(),
        });
        
        subtask.onResolve(res);
        
        cstate.tick();
      });
    } catch (err) {
      console.error("post-lower import fn error:", err);
      throw err;
    }
  }, 100);
  
  return Number(subtask.waitableRep()) << 4 | subtaskState;
}

function _liftFlatU32(ctx) {
  _debugLog('[_liftFlatU32()] args', { ctx });
  let val;
  
  if (ctx.useDirectParams) {
    if (ctx.params.length === 0) { throw new Error('expected at least a single i34 argument'); }
    val = ctx.params[0];
    ctx.params = ctx.params.slice(1);
    return [val, ctx];
  }
  
  if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {
    throw new Error('not enough storage remaining for lift');
  }
  val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
  ctx.storagePtr += 4;
  if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
  
  return [val, ctx];
}

function _lowerFlatBool(memory, vals, storagePtr, storageLen) {
  _debugLog('[_lowerFlatBool()] args', { memory, vals, storagePtr, storageLen });
  if (vals.length !== 1) {
    throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
  }
  if (vals[0] !== 0 && vals[0] !== 1) { throw new Error('invalid value for core value representing bool'); }
  new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
  return 1;
}
const ASYNC_STATE = new Map();

function getOrCreateAsyncState(componentIdx, init) {
  if (!ASYNC_STATE.has(componentIdx)) {
    const newState = new ComponentAsyncState({ componentIdx });
    ASYNC_STATE.set(componentIdx, newState);
  }
  return ASYNC_STATE.get(componentIdx);
}

class ComponentAsyncState {
  static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];
  
  #componentIdx;
  #callingAsyncImport = false;
  #syncImportWait = promiseWithResolvers();
  #locked = false;
  #parkedTasks = new Map();
  #suspendedTasksByTaskID = new Map();
  #suspendedTaskIDs = [];
  #pendingTasks = [];
  #errored = null;
  
  #backpressure = 0;
  #backpressureWaiters = 0n;
  
  #handlerMap = new Map();
  #nextHandlerID = 0n;
  
  mayLeave = true;
  
  #streams;
  
  waitableSets;
  waitables;
  subtasks;
  
  constructor(args) {
    this.#componentIdx = args.componentIdx;
    this.waitableSets = new RepTable({ target: `component [${this.#componentIdx}] waitable sets` });
    this.waitables = new RepTable({ target: `component [${this.#componentIdx}] waitables` });
    this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
    this.#streams = new Map();
  };
  
  componentIdx() { return this.#componentIdx; }
  streams() { return this.#streams; }
  
  errored() { return this.#errored !== null; }
  setErrored(err) {
    _debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
    if (this.#errored) { return; }
    if (!err) {
      err = new Error('error elswehere (see other component instance error)')
      err.componentIdx = this.#componentIdx;
    }
    this.#errored = err;
  }
  
  callingSyncImport(val) {
    if (val === undefined) { return this.#callingAsyncImport; }
    if (typeof val !== 'boolean') { throw new TypeError('invalid setting for async import'); }
    const prev = this.#callingAsyncImport;
    this.#callingAsyncImport = val;
    if (prev === true && this.#callingAsyncImport === false) {
      this.#notifySyncImportEnd();
    }
  }
  
  #notifySyncImportEnd() {
    const existing = this.#syncImportWait;
    this.#syncImportWait = promiseWithResolvers();
    existing.resolve();
  }
  
  async waitForSyncImportCallEnd() {
    await this.#syncImportWait.promise;
  }
  
  setBackpressure(v) { this.#backpressure = v; }
  getBackpressure(v) { return this.#backpressure; }
  incrementBackpressure() {
    const newValue = this.getBackpressure() + 1;
    if (newValue > 2**16) { throw new Error("invalid backpressure value, overflow"); }
    this.setBackpressure(newValue);
  }
  decrementBackpressure() {
    this.setBackpressure(Math.max(0, this.getBackpressure() - 1));
  }
  hasBackpressure() { return this.#backpressure > 0; }
  
  waitForBackpressure() {
    let backpressureCleared = false;
    const cstate = this;
    cstate.addBackpressureWaiter();
    const handlerID = this.registerHandler({
      event: 'backpressure-change',
      fn: (bp) => {
        if (bp === 0) {
          cstate.removeHandler(handlerID);
          backpressureCleared = true;
        }
      }
    });
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (backpressureCleared) { return; }
        clearInterval(interval);
        cstate.removeBackpressureWaiter();
        resolve(null);
      }, 0);
    });
  }
  
  registerHandler(args) {
    const { event, fn } = args;
    if (!event) { throw new Error("missing handler event"); }
    if (!fn) { throw new Error("missing handler fn"); }
    
    if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
      throw new Error(`unrecognized event handler [${event}]`);
    }
    
    const handlerID = this.#nextHandlerID++;
    let handlers = this.#handlerMap.get(event);
    if (!handlers) {
      handlers = [];
      this.#handlerMap.set(event, handlers)
    }
    
    handlers.push({ id: handlerID, fn, event });
    return handlerID;
  }
  
  removeHandler(args) {
    const { event, handlerID } = args;
    const registeredHandlers = this.#handlerMap.get(event);
    if (!registeredHandlers) { return; }
    const found = registeredHandlers.find(h => h.id === handlerID);
    if (!found) { return; }
    this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
  }
  
  getBackpressureWaiters() { return this.#backpressureWaiters; }
  addBackpressureWaiter() { this.#backpressureWaiters++; }
  removeBackpressureWaiter() {
    this.#backpressureWaiters--;
    if (this.#backpressureWaiters < 0) {
      throw new Error("unexepctedly negative number of backpressure waiters");
    }
  }
  
  parkTaskOnAwaitable(args) {
    if (!args.awaitable) { throw new TypeError('missing awaitable when trying to park'); }
    if (!args.task) { throw new TypeError('missing task when trying to park'); }
    const { awaitable, task } = args;
    
    let taskList = this.#parkedTasks.get(awaitable.id());
    if (!taskList) {
      taskList = [];
      this.#parkedTasks.set(awaitable.id(), taskList);
    }
    taskList.push(task);
    
    this.wakeNextTaskForAwaitable(awaitable);
  }
  
  wakeNextTaskForAwaitable(awaitable) {
    if (!awaitable) { throw new TypeError('missing awaitable when waking next task'); }
    const awaitableID = awaitable.id();
    
    const taskList = this.#parkedTasks.get(awaitableID);
    if (!taskList || taskList.length === 0) {
      _debugLog('[ComponentAsyncState] no tasks waiting for awaitable', { awaitableID: awaitable.id() });
      return;
    }
    
    let task = taskList.shift(); // todo(perf)
    if (!task) { throw new Error('no task in parked list despite previous check'); }
    
    if (!task.awaitableResume) {
      throw new Error('task ready due to awaitable is missing resume', { taskID: task.id(), awaitableID });
    }
    task.awaitableResume();
  }
  
  // TODO: we might want to check for pre-locked status here
  exclusiveLock() {
    this.#locked = true;
  }
  
  exclusiveRelease() {
    _debugLog('[ComponentAsyncState#exclusiveRelease()] releasing', {
      locked: this.#locked,
      componentIdx: this.#componentIdx,
    });
    
    this.#locked = false
  }
  
  isExclusivelyLocked() { return this.#locked === true; }
  
  #getSuspendedTaskMeta(taskID) {
    return this.#suspendedTasksByTaskID.get(taskID);
  }
  
  #removeSuspendedTaskMeta(taskID) {
    _debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', { taskID });
    const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
    const meta = this.#suspendedTasksByTaskID.get(taskID);
    this.#suspendedTaskIDs[idx] = null;
    this.#suspendedTasksByTaskID.delete(taskID);
    return meta;
  }
  
  #addSuspendedTaskMeta(meta) {
    if (!meta) { throw new Error('missing task meta'); }
    const taskID = meta.taskID;
    this.#suspendedTasksByTaskID.set(taskID, meta);
    this.#suspendedTaskIDs.push(taskID);
    if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
      this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
    }
  }
  
  suspendTask(args) {
    // TODO(threads): readyFn is normally on the thread
    const { task, readyFn } = args;
    const taskID = task.id();
    _debugLog('[ComponentAsyncState#suspendTask()]', { taskID });
    
    if (this.#getSuspendedTaskMeta(taskID)) {
      throw new Error('task [' + taskID + '] already suspended');
    }
    
    const { promise, resolve } = Promise.withResolvers();
    this.#addSuspendedTaskMeta({
      task,
      taskID,
      readyFn,
      resume: () => {
        _debugLog('[ComponentAsyncState#suspendTask()] resuming suspended task', { taskID });
        // TODO(threads): it's thread cancellation we should be checking for below, not task
        resolve(!task.isCancelled());
      },
    });
    
    return promise;
  }
  
  resumeTaskByID(taskID) {
    const meta = this.#removeSuspendedTaskMeta(taskID);
    if (!meta) { return; }
    if (meta.taskID !== taskID) { throw new Error('task ID does not match'); }
    meta.resume();
  }
  
  tick() {
    _debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });
    const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
    for (const taskID of resumableTasks) {
      const meta = this.#suspendedTasksByTaskID.get(taskID);
      if (!meta || !meta.readyFn) {
        throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
      }
      
      const isReady = meta.readyFn();
      if (!isReady) { continue; }
      
      this.resumeTaskByID(taskID);
    }
    
    return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
  }
  
  addPendingTask(task) {
    this.#pendingTasks.push(task);
  }
  
  addStreamEnd(args) {
    _debugLog('[ComponentAsyncState#addStreamEnd()] args', args);
    const { tableIdx, streamEnd } = args;
    
    let tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      tbl = new RepTable({ target: `component [${this.#componentIdx}] streams` });
      this.#streams.set(tableIdx, tbl);
    }
    
    const streamIdx = tbl.insert(streamEnd);
    return streamIdx;
  }
  
  createStream(args) {
    _debugLog('[ComponentAsyncState#createStream()] args', args);
    const { tableIdx, elemMeta } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while adding stream"); }
    if (elemMeta === undefined) { throw new Error("missing element metadata while adding stream"); }
    
    let tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      tbl = new RepTable({ target: `component [${this.#componentIdx}] streams` });
      this.#streams.set(tableIdx, tbl);
    }
    
    const stream = new InternalStream({
      tableIdx,
      componentIdx: this.#componentIdx,
      elemMeta,
    });
    const writeEndIdx = tbl.insert(stream.getWriteEnd());
    stream.setWriteEndIdx(writeEndIdx);
    const readEndIdx = tbl.insert(stream.getReadEnd());
    stream.setReadEndIdx(readEndIdx);
    
    const rep = STREAMS.insert(stream);
    stream.setRep(rep);
    
    return { writeEndIdx, readEndIdx };
  }
  
  getStreamEnd(args) {
    _debugLog('[ComponentAsyncState#getStreamEnd()] args', args);
    const { tableIdx, streamIdx } = args;
    if (tableIdx === undefined) { throw new Error('missing table idx while retrieveing stream end'); }
    if (streamIdx === undefined) { throw new Error('missing stream idx while retrieveing stream end'); }
    
    const tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      throw new Error(`missing stream table [${tableIdx}] in component [${this.#componentIdx}] while getting stream`);
    }
    
    const stream = tbl.get(streamIdx);
    return stream;
  }
  
  removeStreamEnd(args) {
    _debugLog('[ComponentAsyncState#removeStreamEnd()] args', args);
    const { tableIdx, streamIdx } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
    if (streamIdx === undefined) { throw new Error("missing stream idx while removing stream end"); }
    
    const tbl = this.#streams.get(tableIdx);
    if (!tbl) {
      throw new Error(`missing stream table [${tableIdx}] in component [${this.#componentIdx}] while removing stream end`);
    }
    
    const stream = tbl.get(streamIdx);
    if (!stream) { throw new Error(`component [${this.#componentIdx}] missing stream [${streamIdx}]`); }
    
    const removed = tbl.remove(streamIdx);
    if (!removed) {
      throw new Error(`missing stream [${streamIdx}] (table [${tableIdx}]) in component [${this.#componentIdx}] while removing stream end`);
    }
    
    return stream;
  }
}

const symbolRscHandle = Symbol('handle');

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

const handleTables = [];

function finalizationRegistryCreate (unregister) {
  if (typeof FinalizationRegistry === 'undefined') {
    return { unregister () {} };
  }
  return new FinalizationRegistry(unregister);
}


const module0 = getCoreModule('composed-go.core.wasm');
const module1 = getCoreModule('composed-go.core2.wasm');
const module2 = getCoreModule('composed-go.core3.wasm');
const module3 = getCoreModule('composed-go.core4.wasm');
const module4 = getCoreModule('composed-go.core5.wasm');
const module5 = getCoreModule('composed-go.core6.wasm');
const module6 = getCoreModule('composed-go.core7.wasm');

const { onDone, onNumber } = imports['docs:calculator/stream-sink'];
onDone._isHostProvided = true;

if (onDone=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'onDone', was 'onDone' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

onNumber._isHostProvided = true;

if (onNumber=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'onNumber', was 'onNumber' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

let gen = (function* _initGenerator () {
  const instanceFlags1 = new WebAssembly.Global({ value: "i32", mutable: true }, 3);
  const instanceFlags3 = new WebAssembly.Global({ value: "i32", mutable: true }, 3);
  let exports0;
  let exports1;
  let exports2;
  let exports3;
  
  let lowered_import_0_metadata = {
    qualifiedImportFn: 'docs:calculator/stream-sink@0.1.0#on-number',
    moduleIdx: null,
  };
  
  
  function trampoline0(arg0) {
    _debugLog('[iface="docs:calculator/stream-sink@0.1.0", function="on-number"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = false;
    hostProvided = onNumber?._isHostProvided;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: 3,
        isAsync: false,
        entryFnName: 'onNumber',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(3)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      const isHostAsyncImport = hostProvided && false;
      if (isHostAsyncImport) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
        }
        subtask.setChildTask(task);
        task.setParentSubtask(subtask);
      }
    }
    
    let ret =  onNumber(arg0 >>> 0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/stream-sink@0.1.0", function="on-number"][Instruction::Return]', {
      funcName: 'on-number',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return ret ? 1 : 0;
  }
  
  
  let lowered_import_1_metadata = {
    qualifiedImportFn: 'docs:calculator/stream-sink@0.1.0#on-done',
    moduleIdx: null,
  };
  
  
  function trampoline1() {
    _debugLog('[iface="docs:calculator/stream-sink@0.1.0", function="on-done"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = false;
    hostProvided = onDone?._isHostProvided;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: 3,
        isAsync: false,
        entryFnName: 'onDone',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(3)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      const isHostAsyncImport = hostProvided && false;
      if (isHostAsyncImport) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
        }
        subtask.setChildTask(task);
        task.setParentSubtask(subtask);
      }
    }
    
    let ret; onDone();
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/stream-sink@0.1.0", function="on-done"][Instruction::Return]', {
      funcName: 'on-done',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  }
  
  let exports4;
  let exports5;
  let exports6;
  let memory0;
  
  GlobalComponentAsyncLowers.define({
    componentIdx: lowered_import_0_metadata.moduleIdx,
    qualifiedImportFn: lowered_import_0_metadata.qualifiedImportFn,
    fn: _lowerImport.bind(
    null,
    {
      trampolineIdx: 0,
      componentIdx: 3,
      isAsync: false,
      paramLiftFns: [_liftFlatU32],
      metadata: lowered_import_0_metadata,
      resultLowerFns: [_lowerFlatBool],
      getCallbackFn: () => null,
      getPostReturnFn: () => null,
      isCancellable: false,
      memoryIdx: null,
      getMemoryFn: () => null,
      getReallocFn: () => null,
    },
    ),
  });
  
  
  GlobalComponentAsyncLowers.define({
    componentIdx: lowered_import_1_metadata.moduleIdx,
    qualifiedImportFn: lowered_import_1_metadata.qualifiedImportFn,
    fn: _lowerImport.bind(
    null,
    {
      trampolineIdx: 1,
      componentIdx: 3,
      isAsync: false,
      paramLiftFns: [],
      metadata: lowered_import_1_metadata,
      resultLowerFns: [],
      getCallbackFn: () => null,
      getPostReturnFn: () => null,
      isCancellable: false,
      memoryIdx: null,
      getMemoryFn: () => null,
      getReallocFn: () => null,
    },
    ),
  });
  
  ({ exports: exports0 } = instantiateCore(module0));
  ({ exports: exports1 } = instantiateCore(module1, {
    '': {
      '': exports0._initialize,
    },
  }));
  ({ exports: exports2 } = instantiateCore(module3));
  ({ exports: exports3 } = instantiateCore(module6, {
    callee: {
      adapter0: exports0['docs:adder/add@0.1.0#add'],
      adapter1: exports0['docs:adder/add@0.1.0#sub'],
      adapter2: exports0['docs:adder/add@0.1.0#mul'],
    },
    flags: {
      instance1: instanceFlags1,
      instance3: instanceFlags3,
    },
  }));
  ({ exports: exports4 } = instantiateCore(module2, {
    'docs:adder/add@0.1.0': {
      add: exports3.adapter0,
      mul: exports3.adapter2,
      sub: exports3.adapter1,
    },
    'docs:calculator/stream-sink@0.1.0': {
      'on-done': trampoline1,
      'on-number': trampoline0,
    },
  }));
  ({ exports: exports5 } = instantiateCore(module4, {
    '': {
      $imports: exports2.$imports,
      '0': exports4['docs:calculator/calculate@0.1.0#[dtor]calc-session'],
      '1': exports4['docs:calculator/calculate@0.1.0#[dtor]number-stream'],
    },
  }));
  ({ exports: exports6 } = instantiateCore(module5, {
    '': {
      '': exports4._initialize,
    },
  }));
  memory0 = exports4.memory;
  GlobalComponentMemories.save({ idx: 0, componentIdx: 4, memory: memory0 });
  const handleTable0 = [T_FLAG, 0];
  const finalizationRegistry0 = finalizationRegistryCreate((handle) => {
    const { rep } = rscTableRemove(handleTable0, handle);
    exports2['0'](rep);
  });
  
  handleTables[0] = handleTable0;
  let calculate010ConstructorCalcSession;
  
  class CalcSession{
    constructor() {
      _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[constructor]calc-session"][Instruction::CallWasm] enter', {
        funcName: '[constructor]calc-session',
        paramCount: 0,
        async: false,
        postReturn: false,
      });
      const hostProvided = false;
      
      const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
        componentIdx: 3,
        isAsync: false,
        entryFnName: 'calculate010ConstructorCalcSession',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: true,
      });
      
      let ret = calculate010ConstructorCalcSession();
      endCurrentTask(3);
      var handle1 = ret;
      var rsc0 = new.target === CalcSession ? this : Object.create(CalcSession.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      finalizationRegistry0.register(rsc0, handle1, rsc0);
      Object.defineProperty(rsc0, symbolDispose, { writable: true, value: function () {
        finalizationRegistry0.unregister(rsc0);
        rscTableRemove(handleTable0, handle1);
        rsc0[symbolDispose] = emptyFunc;
        rsc0[symbolRscHandle] = undefined;
        exports2['0'](handleTable0[(handle1 << 1) + 1] & ~T_FLAG);
      }});
      _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[constructor]calc-session"][Instruction::Return]', {
        funcName: '[constructor]calc-session',
        paramCount: 1,
        async: false,
        postReturn: false
      });
      return rsc0;
    }
  }
  let calculate010MethodCalcSessionPushOp;
  
  CalcSession.prototype.pushOp = function pushOp(arg1, arg2) {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "CalcSession" resource.');
    }
    var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
    var val2 = arg1;
    let enum2;
    switch (val2) {
      case 'add': {
        enum2 = 0;
        break;
      }
      case 'sub': {
        enum2 = 1;
        break;
      }
      case 'mul': {
        enum2 = 2;
        break;
      }
      default: {
        if ((arg1) instanceof Error) {
          console.error(arg1);
        }
        
        throw new TypeError(`"${val2}" is not one of the cases of op`);
      }
    }
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.push-op"][Instruction::CallWasm] enter', {
      funcName: '[method]calc-session.push-op',
      paramCount: 3,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodCalcSessionPushOp',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodCalcSessionPushOp(handle0, enum2, toUint32(arg2));
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.push-op"][Instruction::Return]', {
      funcName: '[method]calc-session.push-op',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  let calculate010MethodCalcSessionGetCurrent;
  
  CalcSession.prototype.getCurrent = function getCurrent() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "CalcSession" resource.');
    }
    var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.get-current"][Instruction::CallWasm] enter', {
      funcName: '[method]calc-session.get-current',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodCalcSessionGetCurrent',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret = calculate010MethodCalcSessionGetCurrent(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.get-current"][Instruction::Return]', {
      funcName: '[method]calc-session.get-current',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return ret >>> 0;
  };
  let calculate010MethodCalcSessionGetHistory;
  
  CalcSession.prototype.getHistory = function getHistory() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "CalcSession" resource.');
    }
    var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.get-history"][Instruction::CallWasm] enter', {
      funcName: '[method]calc-session.get-history',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodCalcSessionGetHistory',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret = calculate010MethodCalcSessionGetHistory(handle0);
    endCurrentTask(3);
    var len3 = dataView(memory0).getUint32(ret + 4, true);
    var base3 = dataView(memory0).getUint32(ret + 0, true);
    var result3 = [];
    for (let i = 0; i < len3; i++) {
      const base = base3 + i * 20;
      var ptr2 = dataView(memory0).getUint32(base + 4, true);
      var len2 = dataView(memory0).getUint32(base + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      result3.push({
        value: dataView(memory0).getInt32(base + 0, true) >>> 0,
        op: result2,
        x: dataView(memory0).getInt32(base + 12, true) >>> 0,
        y: dataView(memory0).getInt32(base + 16, true) >>> 0,
      });
    }
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.get-history"][Instruction::Return]', {
      funcName: '[method]calc-session.get-history',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return result3;
  };
  let calculate010MethodCalcSessionReset;
  
  CalcSession.prototype.reset = function reset() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable0[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "CalcSession" resource.');
    }
    var handle0 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.reset"][Instruction::CallWasm] enter', {
      funcName: '[method]calc-session.reset',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodCalcSessionReset',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodCalcSessionReset(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]calc-session.reset"][Instruction::Return]', {
      funcName: '[method]calc-session.reset',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  const handleTable1 = [T_FLAG, 0];
  const finalizationRegistry1 = finalizationRegistryCreate((handle) => {
    const { rep } = rscTableRemove(handleTable1, handle);
    exports2['1'](rep);
  });
  
  handleTables[1] = handleTable1;
  let calculate010ConstructorNumberStream;
  
  class NumberStream{
    constructor() {
      _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[constructor]number-stream"][Instruction::CallWasm] enter', {
        funcName: '[constructor]number-stream',
        paramCount: 0,
        async: false,
        postReturn: false,
      });
      const hostProvided = false;
      
      const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
        componentIdx: 3,
        isAsync: false,
        entryFnName: 'calculate010ConstructorNumberStream',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: true,
      });
      
      let ret = calculate010ConstructorNumberStream();
      endCurrentTask(3);
      var handle1 = ret;
      var rsc0 = new.target === NumberStream ? this : Object.create(NumberStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      finalizationRegistry1.register(rsc0, handle1, rsc0);
      Object.defineProperty(rsc0, symbolDispose, { writable: true, value: function () {
        finalizationRegistry1.unregister(rsc0);
        rscTableRemove(handleTable1, handle1);
        rsc0[symbolDispose] = emptyFunc;
        rsc0[symbolRscHandle] = undefined;
        exports2['1'](handleTable1[(handle1 << 1) + 1] & ~T_FLAG);
      }});
      _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[constructor]number-stream"][Instruction::Return]', {
        funcName: '[constructor]number-stream',
        paramCount: 1,
        async: false,
        postReturn: false
      });
      return rsc0;
    }
  }
  let calculate010MethodNumberStreamStartFibonacci;
  
  NumberStream.prototype.startFibonacci = function startFibonacci() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "NumberStream" resource.');
    }
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-fibonacci"][Instruction::CallWasm] enter', {
      funcName: '[method]number-stream.start-fibonacci',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodNumberStreamStartFibonacci',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodNumberStreamStartFibonacci(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-fibonacci"][Instruction::Return]', {
      funcName: '[method]number-stream.start-fibonacci',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  let calculate010MethodNumberStreamStartSquares;
  
  NumberStream.prototype.startSquares = function startSquares() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "NumberStream" resource.');
    }
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-squares"][Instruction::CallWasm] enter', {
      funcName: '[method]number-stream.start-squares',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodNumberStreamStartSquares',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodNumberStreamStartSquares(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-squares"][Instruction::Return]', {
      funcName: '[method]number-stream.start-squares',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  let calculate010MethodNumberStreamStartPrimes;
  
  NumberStream.prototype.startPrimes = function startPrimes() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "NumberStream" resource.');
    }
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-primes"][Instruction::CallWasm] enter', {
      funcName: '[method]number-stream.start-primes',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodNumberStreamStartPrimes',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodNumberStreamStartPrimes(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.start-primes"][Instruction::Return]', {
      funcName: '[method]number-stream.start-primes',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  let calculate010MethodNumberStreamRead;
  
  NumberStream.prototype.read = function read(arg1) {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "NumberStream" resource.');
    }
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.read"][Instruction::CallWasm] enter', {
      funcName: '[method]number-stream.read',
      paramCount: 2,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodNumberStreamRead',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret = calculate010MethodNumberStreamRead(handle0, toUint32(arg1));
    endCurrentTask(3);
    var ptr2 = dataView(memory0).getUint32(ret + 0, true);
    var len2 = dataView(memory0).getUint32(ret + 4, true);
    var result2 = new Uint32Array(memory0.buffer.slice(ptr2, ptr2 + len2 * 4));
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.read"][Instruction::Return]', {
      funcName: '[method]number-stream.read',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return result2;
  };
  let calculate010MethodNumberStreamStop;
  
  NumberStream.prototype.stop = function stop() {
    var handle1 = this[symbolRscHandle];
    if (!handle1 || (handleTable1[(handle1 << 1) + 1] & T_FLAG) === 0) {
      throw new TypeError('Resource error: Not a valid "NumberStream" resource.');
    }
    var handle0 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.stop"][Instruction::CallWasm] enter', {
      funcName: '[method]number-stream.stop',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010MethodNumberStreamStop',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010MethodNumberStreamStop(handle0);
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="[method]number-stream.stop"][Instruction::Return]', {
      funcName: '[method]number-stream.stop',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  };
  let calculate010EvalExpression;
  
  function evalExpression(arg0, arg1, arg2) {
    var val0 = arg0;
    let enum0;
    switch (val0) {
      case 'add': {
        enum0 = 0;
        break;
      }
      case 'sub': {
        enum0 = 1;
        break;
      }
      case 'mul': {
        enum0 = 2;
        break;
      }
      default: {
        if ((arg0) instanceof Error) {
          console.error(arg0);
        }
        
        throw new TypeError(`"${val0}" is not one of the cases of op`);
      }
    }
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="eval-expression"][Instruction::CallWasm] enter', {
      funcName: 'eval-expression',
      paramCount: 3,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010EvalExpression',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret = calculate010EvalExpression(enum0, toUint32(arg1), toUint32(arg2));
    endCurrentTask(3);
    var ptr1 = dataView(memory0).getUint32(ret + 0, true);
    var len1 = dataView(memory0).getUint32(ret + 4, true);
    var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="eval-expression"][Instruction::Return]', {
      funcName: 'eval-expression',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return result1;
  }
  let calculate010EvalExpressionDetailed;
  
  function evalExpressionDetailed(arg0, arg1, arg2) {
    var val0 = arg0;
    let enum0;
    switch (val0) {
      case 'add': {
        enum0 = 0;
        break;
      }
      case 'sub': {
        enum0 = 1;
        break;
      }
      case 'mul': {
        enum0 = 2;
        break;
      }
      default: {
        if ((arg0) instanceof Error) {
          console.error(arg0);
        }
        
        throw new TypeError(`"${val0}" is not one of the cases of op`);
      }
    }
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="eval-expression-detailed"][Instruction::CallWasm] enter', {
      funcName: 'eval-expression-detailed',
      paramCount: 3,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010EvalExpressionDetailed',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret = calculate010EvalExpressionDetailed(enum0, toUint32(arg1), toUint32(arg2));
    endCurrentTask(3);
    var ptr1 = dataView(memory0).getUint32(ret + 4, true);
    var len1 = dataView(memory0).getUint32(ret + 8, true);
    var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="eval-expression-detailed"][Instruction::Return]', {
      funcName: 'eval-expression-detailed',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    return {
      value: dataView(memory0).getInt32(ret + 0, true) >>> 0,
      op: result1,
      x: dataView(memory0).getInt32(ret + 12, true) >>> 0,
      y: dataView(memory0).getInt32(ret + 16, true) >>> 0,
    };
  }
  let calculate010GenerateFibonacci;
  
  function generateFibonacci(arg0) {
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-fibonacci"][Instruction::CallWasm] enter', {
      funcName: 'generate-fibonacci',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010GenerateFibonacci',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010GenerateFibonacci(toUint32(arg0));
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-fibonacci"][Instruction::Return]', {
      funcName: 'generate-fibonacci',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  }
  let calculate010GenerateSquares;
  
  function generateSquares(arg0) {
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-squares"][Instruction::CallWasm] enter', {
      funcName: 'generate-squares',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010GenerateSquares',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010GenerateSquares(toUint32(arg0));
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-squares"][Instruction::Return]', {
      funcName: 'generate-squares',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  }
  let calculate010GeneratePrimes;
  
  function generatePrimes(arg0) {
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-primes"][Instruction::CallWasm] enter', {
      funcName: 'generate-primes',
      paramCount: 1,
      async: false,
      postReturn: false,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 3,
      isAsync: false,
      entryFnName: 'calculate010GeneratePrimes',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    let ret;calculate010GeneratePrimes(toUint32(arg0));
    endCurrentTask(3);
    _debugLog('[iface="docs:calculator/calculate@0.1.0", function="generate-primes"][Instruction::Return]', {
      funcName: 'generate-primes',
      paramCount: 0,
      async: false,
      postReturn: false
    });
  }
  calculate010ConstructorCalcSession = exports4['docs:calculator/calculate@0.1.0#[constructor]calc-session'];
  calculate010MethodCalcSessionPushOp = exports4['docs:calculator/calculate@0.1.0#[method]calc-session.push-op'];
  calculate010MethodCalcSessionGetCurrent = exports4['docs:calculator/calculate@0.1.0#[method]calc-session.get-current'];
  calculate010MethodCalcSessionGetHistory = exports4['docs:calculator/calculate@0.1.0#[method]calc-session.get-history'];
  calculate010MethodCalcSessionReset = exports4['docs:calculator/calculate@0.1.0#[method]calc-session.reset'];
  calculate010ConstructorNumberStream = exports4['docs:calculator/calculate@0.1.0#[constructor]number-stream'];
  calculate010MethodNumberStreamStartFibonacci = exports4['docs:calculator/calculate@0.1.0#[method]number-stream.start-fibonacci'];
  calculate010MethodNumberStreamStartSquares = exports4['docs:calculator/calculate@0.1.0#[method]number-stream.start-squares'];
  calculate010MethodNumberStreamStartPrimes = exports4['docs:calculator/calculate@0.1.0#[method]number-stream.start-primes'];
  calculate010MethodNumberStreamRead = exports4['docs:calculator/calculate@0.1.0#[method]number-stream.read'];
  calculate010MethodNumberStreamStop = exports4['docs:calculator/calculate@0.1.0#[method]number-stream.stop'];
  calculate010EvalExpression = exports4['docs:calculator/calculate@0.1.0#eval-expression'];
  calculate010EvalExpressionDetailed = exports4['docs:calculator/calculate@0.1.0#eval-expression-detailed'];
  calculate010GenerateFibonacci = exports4['docs:calculator/calculate@0.1.0#generate-fibonacci'];
  calculate010GenerateSquares = exports4['docs:calculator/calculate@0.1.0#generate-squares'];
  calculate010GeneratePrimes = exports4['docs:calculator/calculate@0.1.0#generate-primes'];
  const calculate010 = {
    CalcSession: CalcSession,
    NumberStream: NumberStream,
    evalExpression: evalExpression,
    evalExpressionDetailed: evalExpressionDetailed,
    generateFibonacci: generateFibonacci,
    generatePrimes: generatePrimes,
    generateSquares: generateSquares,
    
  };
  
  return { calculate: calculate010, 'docs:calculator/calculate@0.1.0': calculate010,  };
})();
let promise, resolve, reject;
function runNext (value) {
  try {
    let done;
    do {
      ({ value, done } = gen.next(value));
    } while (!(value instanceof Promise) && !done);
    if (done) {
      if (resolve) return resolve(value);
      else return value;
    }
    if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
    value.then(nextVal => done ? resolve() : runNext(nextVal), reject);
  }
  catch (e) {
    if (reject) reject(e);
    else throw e;
  }
}
const maybeSyncReturn = runNext(null);
return promise || maybeSyncReturn;
}

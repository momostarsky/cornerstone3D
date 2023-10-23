import * as Comlink from 'comlink';
import { RequestType } from '../enums/';
import { RequestPoolManager } from '../requestPool/requestPoolManager';

class CentralizedWorkerManager {
  constructor(maxGlobalWorkers = 5) {
    this.maxGlobalWorkers = maxGlobalWorkers;
    this.workerTypes = {};
    this.currentWorkerIndices = {};
    this.workerPoolManager = new RequestPoolManager('webworker');
    this.workerLoadCounters = {};
  }

  registerWorker(workerName, workerFn, options = {}) {
    const { maxWebWorkersForThisType = 1, overwrite = false } = options;

    if (this.workerTypes[workerName] && !overwrite) {
      console.warn(`Worker type '${workerName}' is already registered...`);
      return;
    }

    this.workerLoadCounters[workerName] = Array(maxWebWorkersForThisType).fill(
      0
    );

    this.workerTypes[workerName] = {
      maxWorkers: maxWebWorkersForThisType,
      instances: [],
    };

    this.currentWorkerIndices[workerName] = 0;

    for (let i = 0; i < maxWebWorkersForThisType; i++) {
      const worker = workerFn();
      const workerWrapper = Comlink.wrap(worker);
      this.workerTypes[workerName].instances.push(workerWrapper);
    }
  }

  getNextWorkerAPI(workerName) {
    if (!this.workerTypes[workerName]) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return null;
    }

    if (!this.workerLoadCounters[workerName]) {
      this.workerLoadCounters[workerName] = [];
    }

    // Find the worker with the minimum load.
    const workerInstances = this.workerTypes[workerName].instances;

    let minLoadIndex = 0;
    let minLoadValue = this.workerLoadCounters[workerName][0] || 0;

    for (let i = 1; i < workerInstances.length; i++) {
      const currentLoadValue = this.workerLoadCounters[workerName][i] || 0;
      if (currentLoadValue < minLoadValue) {
        minLoadIndex = i;
        minLoadValue = currentLoadValue;
      }
    }

    // Update the load counter.
    this.workerLoadCounters[workerName][minLoadIndex]++;

    // return the worker that has the minimum load.
    return { api: workerInstances[minLoadIndex], index: minLoadIndex };
  }

  executeTask(
    workerName,
    methodName,
    successCallback,
    { type = RequestType.Prefetch, priority = 0, args = {}, options = {} }
  ) {
    const requestFn = async () => {
      // when the time comes to execute the request, find the worker with the minimum load.
      // Note: this should be done inside the requestFn, because the load of the workers
      // can change between the time the request is added to the queue and the time it is executed.
      const { api, index } = this.getNextWorkerAPI(workerName);

      if (!api) {
        console.error(`No available worker instance for '${workerName}'`);
        return null;
      }

      try {
        const results = await api[methodName](...args);
        successCallback(results);
      } catch (err) {
        console.error(
          `Error executing method '${methodName}' on worker '${workerName}':`,
          err
        );
        return null;
      } finally {
        this.workerLoadCounters[workerName][index]--;
      }
    };

    this.workerPoolManager.addRequest(requestFn, type, options, priority);
  }

  terminate(workerName) {
    if (!this.workerTypes[workerName]) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return;
    }

    this.workerTypes[workerName].instances.forEach((workerInstance) => {
      workerInstance[Comlink.releaseProxy]();
      workerInstance.terminate();
    });

    delete this.workerTypes[workerName];
    delete this.currentWorkerIndices[workerName];
  }
}

export default CentralizedWorkerManager;

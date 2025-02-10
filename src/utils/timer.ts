import { appLog } from "./tools";

// Note: 由于添加很多定时器后，偶尔会出现定时器不执行的bug，因此使用全局定时器

interface TimerTask {
  // id，需要具有唯一性，如果重复添加时会报错
  id: string;
  // 间隔时间，单位：秒，只能为整数且不能为0，默认为1秒
  interval?: number;
  // 是否立即执行，默认为false
  // 比如说，如果imediate为false、interval设定为1秒、全局定时器距离上次执行已经过了0.5秒，
  // 那么下次执行后才会开始计算间隔，即1.5秒后执行
  // 如果imediate为true，那么会立即执行，然后开始计算间隔，即0.5秒后执行
  immediate?: boolean;
  // 是否暂停，默认为false
  paused?: boolean;
  // 执行函数
  handler: () => void; // 此函数不能为异步函数
}

interface InnerTimerTask {
  id: string;
  interval: number;
  immediate: boolean;
  paused: boolean;
  // 剩余间隔时间
  // 此属性不需要手动设置，由定时器内部维护
  remainingInterval: number;
  handler: () => void; // 此函数不能为异步函数
}

/**
 * 全局定时器
 * 每秒钟执行一次，检查所有任务是否需要执行，执行需要执行的任务
 * 
 * init() 初始化定时器，需要在index.ts中调用
 * stop() 停止定时器，在关闭app时调用
 * addTask(task: TimerTask) 添加任务
 * removeTask(id: string) 删除任务
 * pauseTask(id: string) 暂停任务
 * resumeTask(id: string) 恢复任务
 */
export class GlobalTimer {
  private _timer?: TimerTypes.Timer;
  private _interval: number = 1;
  private _tasks: Map<string, InnerTimerTask> = new Map(); 
  constructor() {}

  init() {
    this._timer = $timer.schedule({
      interval: this._interval,
      handler: () => {
        appLog("timer initialized", "debug");
        this._tasks.forEach((task) => {
          // 如果任务暂停，那么直接中断
          if (task.paused) {
            return;
          }
          // 如果剩余间隔时间大于0，那么减去1
          if (task.remainingInterval > 0) {
            task.remainingInterval--;
          }
          
          // 如果剩余间隔时间小于等于0，那么执行任务
          if (task.remainingInterval <= 0) {
            try {
              task.handler();
            } catch (e) {
              appLog(e, "error");
            } finally {
              // 重新计算剩余间隔时间
              task.remainingInterval = task.interval;
            }
          }
        });
      }
    })
  }

  stop() {
    if (this._timer) {
      this._timer.invalidate()
      this._timer = undefined
    }
  }

  addTask(task: TimerTask) {
    if (this._tasks.has(task.id)) {
      throw new Error(`Task with id ${task.id} already exists`);
    }

    // 计算剩余间隔时间，规则为：
    // 如果immediate为true，那么剩余间隔时间为interval
    // 如果immediate为false，那么剩余间隔时间为interval + 1
    const interval = task.interval || 1;
    const remainingInterval = task.immediate ? interval : interval + 1;

    const innerTask: InnerTimerTask = {
      id: task.id,
      interval: interval,
      immediate: task.immediate ?? false,
      paused: task.paused ?? false,
      remainingInterval: remainingInterval,
      handler: task.handler
    }
    this._tasks.set(task.id, innerTask);
  }

  removeTask(id: string) {
    this._tasks.delete(id);
  }

  pauseTask(id: string) {
    const task = this._tasks.get(id);
    if (task) {
      task.paused = true;
    }
  }

  resumeTask(id: string) {
    const task = this._tasks.get(id);
    if (task) {
      task.paused = false;
    }
  }
}

export const globalTimer = new GlobalTimer();
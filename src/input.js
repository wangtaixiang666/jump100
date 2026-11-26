/* =========================================================================
 * input.js — 键盘输入管理
 * 用状态对象记录按键的持续状态；jumpPressed 记录"本帧刚按下"的边沿事件，
 * keydown 的 event.repeat 被忽略，避免自动重复触发。
 * ========================================================================= */

const KEY_MAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
};

export class Input {
  constructor() {
    /** @type {{left:boolean,right:boolean,jump:boolean}} 持续按下状态 */
    this.state = { left: false, right: false, jump: false };
    /** @type {{jump:boolean,left:boolean,right:boolean}} 本帧刚按下的边沿 */
    this.pressed = { jump: false, left: false, right: false };
    /** @type {{jump:boolean}} 本帧刚松开的边沿 */
    this.released = { jump: false };
    /** 一次性注册的额外按键回调，例如静音/重开 */
    this.onAction = null;

    window.addEventListener('keydown', (e) => this._onKeyDown(e), { passive: false });
    window.addEventListener('keyup', (e) => this._onKeyUp(e), { passive: false });
    window.addEventListener('blur', () => this.clear());
  }

  _onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (action) {
      e.preventDefault();
      if (!e.repeat && !this.state[action]) this.pressed[action] = true;
      this.state[action] = true;
    }
    if (!e.repeat && this.onAction) {
      if (e.code === 'KeyM') this.onAction('mute');
      if (e.code === 'KeyR') this.onAction('restart');
      if (e.code === 'Enter') this.onAction('enter');
      if (e.code === 'Escape') this.onAction('escape');
    }
  }

  _onKeyUp(e) {
    const action = KEY_MAP[e.code];
    if (action) {
      e.preventDefault();
      if (action === 'jump' && this.state.jump) this.released.jump = true;
      this.state[action] = false;
    }
  }

  /** 每帧末尾调用，清除边沿状态 */
  endFrame() {
    this.pressed.jump = this.pressed.left = this.pressed.right = false;
    this.released.jump = false;
  }

  /** 窗口失焦时清空，避免卡键 */
  clear() {
    this.state.left = this.state.right = this.state.jump = false;
    this.endFrame();
  }
}

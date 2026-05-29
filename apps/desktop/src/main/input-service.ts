// Input simulation via OS-native tools — zero native Node modules needed.
// Windows: PowerShell + Win32 API (inline C#)
// macOS:   cliclick (brew install cliclick) / osascript
// Linux:   xdotool
import { execFile, exec } from 'child_process';
import { screen } from 'electron';

const PLATFORM = process.platform;

type Modifiers = { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };

export class InputService {
  private absCoords(relX: number, relY: number): { x: number; y: number } {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { x: Math.round(relX * width), y: Math.round(relY * height) };
  }

  moveMouse(relX: number, relY: number): void {
    const { x, y } = this.absCoords(relX, relY);
    if (PLATFORM === 'win32') {
      // Load assembly (no compilation) then set cursor position
      this.ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.Cursor]::Position=New-Object System.Drawing.Point(${x},${y})`);
    } else if (PLATFORM === 'darwin') {
      exec(`cliclick m:${x},${y}`, () => {});
    } else {
      exec(`xdotool mousemove ${x} ${y}`, () => {});
    }
  }

  mouseClick(relX: number, relY: number, button: string, type: string): void {
    const { x, y } = this.absCoords(relX, relY);
    const isRight = button === 'right';
    const isDouble = type === 'double';

    if (PLATFORM === 'win32') {
      const down = isRight ? '0x08' : '0x02';
      const up   = isRight ? '0x10' : '0x04';
      const repeat = isDouble ? 2 : 1;
      this.ps(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int c,int e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
}
"@
[M]::SetCursorPos(${x},${y})
for($i=0;$i -lt ${repeat};$i++){[M]::mouse_event(${down},0,0,0,0);[M]::mouse_event(${up},0,0,0,0)}
`);
    } else if (PLATFORM === 'darwin') {
      const cliBtn = isRight ? 'rc' : isDouble ? 'dc' : 'c';
      exec(`cliclick ${cliBtn}:${x},${y}`, () => {});
    } else {
      const btn = isRight ? '3' : button === 'middle' ? '2' : '1';
      const dbl = isDouble ? '--repeat 2 --delay 0 ' : '';
      exec(`xdotool mousemove ${x} ${y} click ${dbl}${btn}`, () => {});
    }
  }

  scroll(_relX: number, _relY: number, _deltaX: number, deltaY: number): void {
    const scrollAmount = deltaY > 0 ? -120 : 120;
    if (PLATFORM === 'win32') {
      this.ps(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int c,int e); }
"@
[M]::mouse_event(0x0800,0,0,${scrollAmount},0)
`);
    } else if (PLATFORM === 'darwin') {
      exec(`cliclick ${deltaY > 0 ? 'kd' : 'ku'}:3`, () => {});
    } else {
      exec(`xdotool click ${deltaY > 0 ? '5' : '4'}`, () => {});
    }
  }

  keyPress(key: string, modifiers: Modifiers): void {
    if (PLATFORM === 'win32') this.winKey(key, modifiers);
    else if (PLATFORM === 'darwin') this.macKey(key, modifiers);
    else this.linuxKey(key, modifiers);
  }

  // ─── Windows (PowerShell + SendInput) ─────────────────────────
  private winKey(key: string, mod: Modifiers): void {
    const mapped = WIN_KEY_MAP[key] ?? (key.length === 1 ? key : null);
    if (!mapped) return;

    let send = '';
    if (mod.ctrl)  send += '^';
    if (mod.alt)   send += '%';
    if (mod.shift) send += '+';
    send += mapped.length > 1 ? `{${mapped}}` : mapped
      .replace(/\+/g, '{+}').replace(/\^/g, '{^}')
      .replace(/%/g, '{%}').replace(/~/g, '{~}');

    this.ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${send}")`);
  }

  // ─── macOS (osascript) ─────────────────────────────────────────
  private macKey(key: string, mod: Modifiers): void {
    const mapped = MAC_KEY_MAP[key] ?? key;
    const using: string[] = [];
    if (mod.ctrl)  using.push('control down');
    if (mod.alt)   using.push('option down');
    if (mod.shift) using.push('shift down');
    if (mod.meta)  using.push('command down');
    const usingStr = using.length ? ` using {${using.join(', ')}}` : '';
    exec(`osascript -e 'tell application "System Events" to keystroke "${mapped}"${usingStr}'`, () => {});
  }

  // ─── Linux (xdotool) ──────────────────────────────────────────
  private linuxKey(key: string, mod: Modifiers): void {
    const parts: string[] = [];
    if (mod.ctrl)  parts.push('ctrl');
    if (mod.alt)   parts.push('alt');
    if (mod.shift) parts.push('shift');
    if (mod.meta)  parts.push('super');
    parts.push(LINUX_KEY_MAP[key] ?? key.toLowerCase());
    exec(`xdotool key ${parts.join('+')}`, () => {});
  }

  // ─── PowerShell runner (Windows) ──────────────────────────────
  private ps(script: string): void {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command', script.trim(),
    ], { windowsHide: true }, () => {});
  }
}

// ─── Key Maps ─────────────────────────────────────────────────────

const WIN_KEY_MAP: Record<string, string> = {
  Enter: 'ENTER', Backspace: 'BACKSPACE', Delete: 'DELETE', Tab: 'TAB',
  Escape: 'ESC', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  F1:'F1', F2:'F2', F3:'F3', F4:'F4', F5:'F5', F6:'F6',
  F7:'F7', F8:'F8', F9:'F9', F10:'F10', F11:'F11', F12:'F12',
  Insert: 'INS', ' ': ' ', CapsLock: 'CAPSLOCK',
};

const MAC_KEY_MAP: Record<string, string> = {
  Enter: 'return', Backspace: 'delete', Delete: 'forwarddelete', Tab: 'tab',
  Escape: 'escape', ArrowLeft: 'leftarrow', ArrowRight: 'rightarrow',
  ArrowUp: 'uparrow', ArrowDown: 'downarrow',
  F1:'f1', F2:'f2', F3:'f3', F4:'f4', F5:'f5', F6:'f6',
};

const LINUX_KEY_MAP: Record<string, string> = {
  Enter: 'Return', Backspace: 'BackSpace', Delete: 'Delete', Tab: 'Tab',
  Escape: 'Escape', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Home: 'Home', End: 'End', PageUp: 'Prior', PageDown: 'Next',
  F1:'F1', F2:'F2', F3:'F3', F4:'F4', F5:'F5', F6:'F6',
  F7:'F7', F8:'F8', F9:'F9', F10:'F10', F11:'F11', F12:'F12',
  ' ': 'space', CapsLock: 'Caps_Lock',
};

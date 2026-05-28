declare module 'screenshot-desktop' {
  interface Display {
    id: number;
    name?: string;
    width?: number;
    height?: number;
    scaleFactor?: number;
  }
  function screenshot(options?: { screen?: number | string }): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<Display[]>;
  }
  export = screenshot;
}

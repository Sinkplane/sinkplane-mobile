// Metro resolves static image imports to a numeric asset id.
declare module '*.png' {
  const value: number;
  export = value;
}

declare module '*.jpg' {
  const value: number;
  export = value;
}

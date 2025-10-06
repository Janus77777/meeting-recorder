declare module 'opencc-js' {
  export const Converter: (opts: { from?: string; to?: string }) => (s: string) => string;
  export const ConverterFactory: (...args: any[]) => (s: string) => string;
  export const CustomConverter: (dict: any[] | string) => (s: string) => string;
  export const HTMLConverter: (...args: any[]) => any;
  export const Locale: {
    from: Record<string, any>;
    to: Record<string, any>;
  };
  const _default: any;
  export default _default;
}


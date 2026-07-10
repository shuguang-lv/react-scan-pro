# @react-scan-pro/vite-plugin

A Vite plugin that integrates React Scan Pro into your Vite application, automatically detecting performance issues in your React components.

## Installation

```bash
# npm
npm install -D @react-scan-pro/vite-plugin react-scan-pro

# pnpm
pnpm add -D @react-scan-pro/vite-plugin react-scan-pro

# yarn
yarn add -D @react-scan-pro/vite-plugin react-scan-pro
```

> **Note:** Make sure `react-scan-pro` is installed as a peer dependency. The plugin will automatically locate it in your project's dependency tree.

## Usage

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactScan from "@react-scan-pro/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    reactScan({
      // options (optional)
    }),
  ],
});
```

## Options

| Option             | Type      | Default                                  | Description                                         |
| ------------------ | --------- | ---------------------------------------- | --------------------------------------------------- |
| `enable`           | `boolean` | `process.env.NODE_ENV === 'development'` | Enable/disable scanning                             |
| `scanOptions`      | `object`  | `{ ... }`                                | Custom React Scan Pro options                       |
| `autoDisplayNames` | `boolean` | `false`                                  | Automatically add display names to React components |
| `debug`            | `boolean` | `false`                                  | Enable debug logging                                |

## Example Configuration

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactScan from "@react-scan-pro/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    reactScan({
      enable: true,
      autoDisplayNames: true,
      scanOptions: {}, // React Scan Pro specific options
    }),
  ],
});
```

## Development vs Production

- In development: The plugin injects React Scan Pro directly into your application for real-time analysis
- In production: The plugin can be disabled/enabled by default with specific options

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

React Scan Pro Vite Plugin is [MIT-licensed](LICENSE) open-source software by Aiden Bai, [Million Software, Inc.](https://million.dev), and [contributors](https://github.com/shuguang-lv/react-scan-pro/graphs/contributors).

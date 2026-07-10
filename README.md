# <img src="https://github.com/shuguang-lv/react-scan-pro/blob/main/.github/assets/logo.svg" width="30" height="30" align="center" /> React Scan Pro

React Scan Pro automatically detects performance issues in your React app.

- Requires no code changes -- just drop it in
- Highlights exactly the components you need to optimize
- Always accessible through a toolbar on page

### Quick Start

```bash
npx -y react-scan-pro@latest init
```

### [**Try out a demo! →**](https://github.com/shuguang-lv/react-scan-pro)

<img
  src="https://github.com/user-attachments/assets/c21b3afd-c7e8-458a-a760-9a027be7dc02"
  alt="React Scan Pro in action"
  width="600"
/>

## Install

The `init` command will automatically detect your framework, install `react-scan-pro` via npm, and set up your project.

```bash
npx -y react-scan-pro@latest init
```

### Manual Installation

Install the package:

```bash
npm install -D react-scan-pro
```

Then add the script tag to your app. Pick the guide for your framework:

#### Script Tag

Paste this before any scripts in your `index.html`:

```html
<!-- paste this BEFORE any scripts -->
<script crossorigin="anonymous" src="//unpkg.com/react-scan-pro/dist/auto.global.js"></script>
```

#### Next.js (App Router)

Add this inside of your `app/layout.tsx`:

```tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          src="//unpkg.com/react-scan-pro/dist/auto.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

#### Next.js (Pages Router)

Add this into your `pages/_document.tsx`:

```tsx
import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <Script
          src="//unpkg.com/react-scan-pro/dist/auto.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```

#### Vite

Example `index.html` with React Scan Pro enabled:

```html
<!doctype html>
<html lang="en">
  <head>
    <script crossorigin="anonymous" src="//unpkg.com/react-scan-pro/dist/auto.global.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### Remix

Add this inside your `app/root.tsx`:

```tsx
import { Links, Meta, Outlet, Scripts } from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <Meta />
        <script crossOrigin="anonymous" src="//unpkg.com/react-scan-pro/dist/auto.global.js" />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

### Browser Extension

Install the extension by following the guide [here](https://github.com/shuguang-lv/react-scan-pro/blob/main/BROWSER_EXTENSION_GUIDE.md).

## API Reference

<details>
<summary><code>Options</code></summary>

<br />

```tsx
export interface Options {
  /**
   * Enable/disable scanning
   * @default true
   */
  enabled?: boolean;

  /**
   * Force React Scan Pro to run in production (not recommended)
   * @default false
   */
  dangerouslyForceRunInProduction?: boolean;

  /**
   * Log renders to the console
   * @default false
   */
  log?: boolean;

  /**
   * Show toolbar bar
   * @default true
   */
  showToolbar?: boolean;

  /**
   * Animation speed
   * @default "fast"
   */
  animationSpeed?: "slow" | "fast" | "off";

  scope?: ScanScope | Array<ScanScope>;
  report?: SummaryReportOptions | RawReportOptions;

  onCommitStart?: () => void;
  onRender?: (fiber: Fiber, renders: Array<Render>) => void;
  onCommitFinish?: () => void;
}
```

</details>

- `scan(options: Options)`: Imperative API to start scanning
- `useScan(options: Options)`: Hook API to start scanning
- `setOptions(options: Options): void`: Set options at runtime
- `getOptions()`: Get the current options
- `onReport(listener)`: Subscribe to completed scan-session reports
- `getLastReport()`: Read the most recently completed report
- `onRender(Component, onRender: (fiber: Fiber, render: Render) => void)`: Hook into a specific component's renders

### Session reports

```tsx
scan({
  enabled: false,
  scope: { kind: "component-name", name: "App" },
  report: {
    mode: "summary",
    limit: 100,
    sortBy: "renderCount",
    onComplete: (report) => console.log(report.components),
  },
});

setOptions({ enabled: true });
// Exercise the application, then finish the session.
setOptions({ enabled: false });
```

Use `mode: "raw"` to receive chronological per-render records. Raw mode keeps 10,000
records by default and reports whether additional records were dropped.

When the toolbar is enabled, open the **Session reports** panel after a capture completes to browse
the same Summary or Raw object visually. The panel can copy the complete JSON to the clipboard or
export it as a `.json` file. Raw rows are virtualized, so large captures do not create thousands of
DOM nodes.

### Script tag API

```html
<script>
  window.__REACT_SCAN_PRO_OPTIONS__ = {
    enabled: false,
    report: { mode: "summary" },
  };
</script>
<script src="https://unpkg.com/react-scan-pro/dist/auto.global.js"></script>
<script>
  const unsubscribe = window.reactScanPro.onReport((report) => {
    console.log(report);
    // In an iframe, set allowInIframe: true above, then forward to the host:
    window.parent.postMessage({ type: "react-scan-pro:report", report }, "*");
    // A server-backed host can upload the same JSON-safe report with fetch().
  });
  window.reactScanPro.setOptions({ enabled: true });
  // Later: window.reactScanPro.setOptions({ enabled: false });
</script>
```

`onReport()` supports multiple listeners and returns an unsubscribe function. The most recent
completed report is also available from `getLastReport()`. During 0.1.x, `window.reactScan`
remains an alias of the same callable object for compatibility.

## Why React Scan Pro?

React can be tricky to optimize.

The issue is that component props are compared by reference, not value. This is intentional -- rendering can be cheap to run.

However, this makes it easy to accidentally cause unnecessary renders, making the app slow. Even production apps with hundreds of engineers can't fully optimize their apps (see [GitHub](https://github.com/shuguang-lv/react-scan-pro/blob/main/.github/assets/github.mp4), [Twitter](https://github.com/shuguang-lv/react-scan-pro/blob/main/.github/assets/twitter.mp4), and [Instagram](https://github.com/shuguang-lv/react-scan-pro/blob/main/.github/assets/instagram.mp4)).

```jsx
<ExpensiveComponent onClick={() => alert("hi")} style={{ color: "purple" }} />
```

React Scan Pro helps you identify these issues by automatically detecting and highlighting renders that cause performance issues.

## Resources & Contributing

Want to try it out? Check the [demo](https://github.com/shuguang-lv/react-scan-pro).

Looking to contribute? Check the [Contributing Guide](https://github.com/shuguang-lv/react-scan-pro/blob/main/CONTRIBUTING.md).

Want to talk to the community? Join our [Discord](https://discord.gg/X9yFbcV2rF).

Find a bug? Head to our [issue tracker](https://github.com/shuguang-lv/react-scan-pro/issues).

[**→ Start contributing on GitHub**](https://github.com/shuguang-lv/react-scan-pro/blob/main/CONTRIBUTING.md)

## Acknowledgments

- [React Devtools](https://react.dev/learn/react-developer-tools) for the initial idea of highlighting renders
- [Million Lint](https://million.dev) for scanning and linting approaches
- [Why Did You Render?](https://github.com/welldone-software/why-did-you-render) for the concept of detecting unnecessary renders

## License

React Scan Pro is [MIT-licensed](LICENSE) open-source software by Aiden Bai, [Million Software, Inc.](https://million.dev), and [contributors](https://github.com/shuguang-lv/react-scan-pro/graphs/contributors).

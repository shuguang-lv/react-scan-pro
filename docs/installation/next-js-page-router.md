# NextJS Page Router Guide

## As a script tag

Add the script tag to your `pages/_document`

Refer to the [CDN Guide](https://github.com/shuguang-lv/react-scan-pro/blob/main/docs/installation/cdn.md) for the available URLs.

```jsx
// pages/_document
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script src="https://unpkg.com/react-scan-pro/dist/auto.global.js" />

        {/* rest of your scripts go under */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```

## As a module import

Add the following code to your `App` component in `pages/_app`:

```jsx
// pages/_app

// react-scan-pro must be the top-most import
import { scan } from "react-scan-pro";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Make sure to run React Scan Pro after hydration
    scan({
      enabled: true,
    });
  }, []);
  return <Component {...pageProps} />;
}
```

If you want react-scan-pro to also run in production, use the react-scan-pro/all-environments import path

```diff
- import { scan } from "react-scan-pro";
+ import { scan } from "react-scan-pro/all-environments";
```

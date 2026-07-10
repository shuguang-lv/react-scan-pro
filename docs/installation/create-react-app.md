# Create React App (CRA) Guide

## As a script tag

Add the script tag to your `index.html`.

Refer to the [CDN Guide](https://github.com/shuguang-lv/react-scan-pro/blob/main/docs/installation/cdn.md) for the available URLs.

```html
<!doctype html>
<html lang="en">
  <head>
    <script src="https://unpkg.com/react-scan-pro/dist/auto.global.js"></script>

    <!-- rest of your scripts go under -->
  </head>
  <body>
    <!-- ... -->
  </body>
</html>
```

## As a module import

In your project entrypoint (e.g. `src/index`, `src/main`):

```jsx
// src/index.jsx

// must be imported before React and React DOM
import { scan } from "react-scan-pro";
import React from "react";

scan({
  enabled: true,
});
```

If you want react-scan-pro to also run in production, use the react-scan-pro/all-environments import path

```diff
- import { scan } from "react-scan-pro";
+ import { scan } from "react-scan-pro/all-environments";
```

> [!CAUTION]
> React Scan Pro must be imported before React (and other React renderers like React DOM) in your entire project, as it needs to hijack React DevTools before React gets to access it.

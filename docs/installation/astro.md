# Astro Guide

## As a script tag

Add the script tag to your root layout.

Refer to the [CDN Guide](https://github.com/shuguang-lv/react-scan-pro/blob/main/docs/installation/cdn.md) for the available URLs.

```astro
<!doctype html>
<html lang="en">
  <head>
    <script is:inline src="https://unpkg.com/react-scan-pro/dist/auto.global.js" />

    <!-- rest of your scripts go under -->
  </head>
  <body>
    <!-- ... -->
  </body>
</html>
```

## As a module import

Add the script to your root layout

```astro
<!doctype html>
<html lang="en">
  <head>
    <script>
      import { scan } from 'react-scan-pro';

      scan({
        enabled: true,
      });
    </script>
    <!-- rest of your scripts go under -->
  </head>
  <body>
    <!-- ... -->
  </body>
</html>
```

If you want react-scan-pro to also run in production, use the react-scan-pro/all-environments import path

```diff
- import { scan } from "react-scan-pro";
+ import { scan } from "react-scan-pro/all-environments";
```

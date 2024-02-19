## Requirements

- Nodejs (version 18.17.0 or higher)

### Steps

- In order to install dependencies, run `npm install` in terminal (with current directory opened in your terminal shell).
- To run the script, simply type `node index.js [company]` (replace `[company]` with an actual company url slug). For example, in `https://linkedin.com/company/hrways/` company name is `hrways`.

### Note

You need to install cookie-editor extension on browser, open and signIn linkedin, click the extension and then export the cookies as json.
You've to update `cookies.json` file with your linkedin account cookies, without cookies script won't work.
You can export cookies in JSON format from browser using various extensions avaialable. One such extension is `Cookie-Editor`, you can install it from [https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)

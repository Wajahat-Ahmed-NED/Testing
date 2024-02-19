const fs = require("fs");
const puppeteer = require("puppeteer");

main();

async function main() {
  // check usage
  const args = process.argv;
  if (args.length !== 3) {
    console.log(`Please use the following format to run the script:\n`);
    console.log(`\t node index.js companyName\n`);
    console.log(
      `Note: replace 'companyName' with your desired company for which you want to scrap employ data`
    );
    return;
  }

  const companyName = args[2];
  const companyUrl = getCompanyUrl(companyName);

  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();

  // no timeout
  page.setDefaultNavigationTimeout(0);

  // set cookies
  let cookies;
  try {
    cookies = loadCookies();
  } catch (e) {
    console.error(e);
    console.error(
      "Please make sure the you've set cookies in 'cookies.json' file in valid JSON format"
    );
    return null;
  }

  await page.setCookie(...cookies);

  // grab all employees urls
  console.log(`Fetching employees profile links:`);
  await page.goto(companyUrl);
  await page.waitForNetworkIdle();
  await scrollToBottom(page); // to load all employees

  const employeesLinks = await page.evaluate(() => {
    const elms = document.querySelectorAll(
      ".scaffold-finite-scroll__content ul li .artdeco-entity-lockup__title a"
    );
    const links = [];
    elms.forEach((el) => {
      const href = el.getAttribute("href");
      if (
        href &&
        !href.startsWith("https://www.linkedin.com/search/results/")
      ) {
        links.push(href);
      }
    });

    return links;
  });

  const data = [];

  for (const [index, link] of employeesLinks.entries()) {
    console.log(`Processing ${index + 1} / ${employeesLinks.length}`);

    await page.goto(link, { waitUntil: 'load', timeout: 0 });
    await page.waitForNetworkIdle();

    const currentCompany = await page.evaluate(() => {
      const el = document.querySelector(
        ".pv-text-details__right-panel li:first-child button span"
      );
      return el ? el.innerText : "";
    });

    const about = await page.evaluate(() => {
      const el = document.querySelector(
        '#about ~ div:nth-child(3) span[aria-hidden="true"]'
      );
      return el ? el.innerText : "";
    });

    const employeeName = await page.evaluate(() => {
      const el = document.querySelector("h1");
      return el ? el.innerText : "";
    });

    const location = await page.evaluate(() => {
      const el = document.querySelector(
        ".pv-text-details__right-panel ~ div .t-black--light"
      );
      return el ? el.innerText : "";
    });

    const linkedinUrl = page.url();

    const role = await page.evaluate(() => {
      const el = document.querySelector(
        "#experience ~div:nth-child(3) ul.pvs-list > li:first-child ul.pvs-list li:first-child a span:first-child"
      );
      return el ? el.innerText : "";
    });

    const timeInCompany = await page.evaluate(() => {
      const el = document.querySelector(
        "#experience ~div:nth-child(3) ul.pvs-list > li:first-child div > div:nth-child(2) > div:first-child a > span > span"
      );
      return el ? el.innerText : "";
    });

    const lengthInPosition = await page.evaluate(() => {
      const el = document.querySelector(
        "#experience ~div:nth-child(3) ul.pvs-list > li:first-child ul.pvs-list li:first-child div > div:nth-child(2) > div:first-child a > span > span"
      );
      return el ? el.innerText : "";
    });

    data.push({
      name: employeeName,
      currentCompany,
      location,
      role,
      linkedinUrl,
      about,
      timeInCompany,
      lengthInPosition,
    });
  }

  const f = fs.createWriteStream("./data.csv");
  f.write(
    `Name, Current Company, Location, Role,  Linkedin Url, About, Time in Company, Length in Position \n`
  );
  data.forEach((obj) => {
    f.write(
      `${obj.name}, ${obj.currentCompany}, ${obj.location}, ${obj.role}, ${obj.linkedinUrl}, ${obj.about}, ${obj.timeInCompany}, ${obj.lengthInPosition} \n`
    );
  });
  f.close();

  //fs.writeFileSync("./test.json", JSON.stringify({ data }));

  await browser.close();

  console.log("All done :)");
}

function loadCookies() {
  const cookies = fs.readFileSync("./cookies.json");
  const cookiesJson = JSON.parse(cookies);
  const normalized = cookiesJson.map((c) => {
    if (c.sameSite === null) return { ...c, sameSite: "no_restriction" };
    return c;
  });
  return normalized;
}

function getCompanyUrl(companyName) {
  return `https://www.linkedin.com/company/${companyName}/people`;
}

async function scrollToBottom(page) {
  await page.evaluate(async () => {
    let scrollPosition = 0;
    let documentHeight = document.body.scrollHeight;

    while (documentHeight > scrollPosition) {
      window.scrollBy(0, documentHeight);
      await new Promise((resolve) => {
        setTimeout(resolve, 4000);
      });
      scrollPosition = documentHeight;
      documentHeight = document.body.scrollHeight;
    }
  });
}

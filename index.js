const fs = require("fs");
const xl = require("excel4node");

const wb = new xl.Workbook();
const ws = wb.addWorksheet("Employees");

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

  // load cookies
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

  const SESSION_ID = getSessionId(cookies);
  if (!SESSION_ID) {
    console.error("Failed to load session id");
    return null;
  }

  // set companyId
  let companyId;
  try {
    console.log("Getting company id...");
    companyId = await getCompanyId(companyName);
  } catch (e) {
    console.error(e);
  }

  if (!companyId) {
    console.error("Failed to get company id, please try again.");
    return null;
  }

  const headers = {
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    Cookie: cookies,
    "Csrf-Token": SESSION_ID,
    Dnt: "1",
    Referer: `https://www.linkedin.com/company/${companyName}/people/`,
    "Sec-Ch-Ua":
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "X-Li-Lang": "en_US",
    "X-Li-Page-Instance":
      "urn:li:page:d_flagship3_search_srp_people_load_more;Ux/gXNk8TtujmdQaaFmrPA==",
    "X-Li-Track":
      '{"clientVersion":"1.13.9792","mpVersion":"1.13.9792","osName":"web","timezoneOffset":6,"timezone":"Asia/Dhaka","deviceFormFactor":"DESKTOP","mpName":"voyager-web","displayDensity":1.3125,"displayWidth":1920.1875,"displayHeight":1080.1875}',
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // load all employees
  const emplData = [];

  const perPageResults = 12;
  let maxRequests = 100; // changed below as per total employees
  let currRequestNum = 1;

  for (const pageNum of range(0, 1000, perPageResults)) {
    if (currRequestNum > maxRequests) break;

    const url = `https://www.linkedin.com/voyager/api/graphql?variables=(start:${pageNum},origin:FACETED_SEARCH,query:(flagshipSearchIntent:ORGANIZATIONS_PEOPLE_ALUMNI,queryParameters:List((key:currentCompany,value:List(${companyId})),(key:resultType,value:List(ORGANIZATION_ALUMNI))),includeFiltersInResponse:true),count:${perPageResults})&queryId=voyagerSearchDashClusters.411056b8f4311e273d4c7279d5fb1bd1`;

    console.log(`Requesting page: #${currRequestNum}`);
    const res = await fetch(url, {
      headers: headers,
    });
    if (res.status !== 200) {
      console.error(`Invalid status code: ${res.status}`);
      continue;
    }

    const json = await res.json();
    const totalPersons = json.data.data.searchDashClustersByAll.paging.total;
    if (totalPersons) {
      maxRequests = Math.ceil(totalPersons / perPageResults);
    }
    const results = json.included;

    for (const personData of results) {
      if (
        personData.$type ===
        "com.linkedin.voyager.dash.search.EntityResultViewModel"
      ) {
        let profileUrl = personData.navigationUrl;
        if (!profileUrl) continue; // not accessible
        if (profileUrl.includes("?")) profileUrl = profileUrl.split("?")[0];
        if (profileUrl.includes("%")) continue;

        const pObj = {
          name: personData.title.text,
          linkedinUrl: profileUrl,
          header: personData.primarySubtitle.text,
        };
        emplData.push(pObj);
      }
    }

    currRequestNum++;
    console.log("Waiting before making a new request...");
    await sleep(4000);
  }

  fs.writeFileSync("./test.json", JSON.stringify({ data: emplData }));
  console.log(`Total employees found: ${emplData.length}`);

  // grab all employees urls
  console.log(`Fetching employees profile links:`);

  const dataset = [];

  for (const empl of emplData) {
    const urlArr = empl.linkedinUrl.split("/");
    const public_urn = urlArr[urlArr.length - 1];
    console.log(`Processing: ${public_urn}`);
    const url = `https://www.linkedin.com/voyager/api/identity/profiles/${public_urn}/profileView?_l=en_US`;
    const res = await fetch(url, {
      headers: headers,
    });
    if (res.status !== 200) {
      console.error(`Invalid status: ${res.status}`);
      continue;
    }

    const json = await res.json();
    const result = json.included;

    fs.writeFileSync("./data.json", JSON.stringify({ data: result }));
    // return;
    const data = {
      name: empl.name ? empl.name : "",
      header: empl.header ? empl.header : "",
      linkedinUrl: empl.linkedinUrl ? empl.linkedinUrl : "",
    };

    let tempHoldVariables = {
      currentCompany: "",
      profilePosition: [],
      profile: [],
    };
    for (const obj of result) {
      if (obj.$type === "com.linkedin.voyager.identity.profile.Position") {
        tempHoldVariables.profilePosition.push(obj);
      }
      if (obj.$type === "com.linkedin.voyager.identity.profile.Profile") {
        data.about = obj.summary ? obj.summary : "";
        data.location = obj.geoLocationName
          ? obj.geoLocationName
          : obj.locationName;
      }
      if (obj.$type === "com.linkedin.voyager.identity.profile.PositionGroup") {
        tempHoldVariables.profile.push(obj);
      }
    }

    let max =
      tempHoldVariables?.profilePosition[0]?.timePeriod?.startDate?.year || 0;
    let month = 0;
    let i = 0;
    tempHoldVariables?.profilePosition?.map((e, f) => {
      if (e.timePeriod?.startDate?.year > max) {
        max = e.timePeriod?.startDate?.year;
        month = e.timePeriod?.startDate?.month;
        i = f;
      } else if (e.timePeriod?.startDate?.year === max) {
        if (e.timePeriod?.startDate?.month > month) {
          month = e.timePeriod?.startDate?.month;
          i = f;
        }
      }
    });

    data.role = tempHoldVariables?.profilePosition[i].title
      ? tempHoldVariables?.profilePosition[i].title
      : "";
    data.currentCompany = tempHoldVariables?.profilePosition[i].companyName
      ? tempHoldVariables?.profilePosition[i].companyName
      : "";
    tempHoldVariables.currentCompany =
      tempHoldVariables?.profilePosition[i].companyName;

    data.location = tempHoldVariables?.profilePosition[i].geoLocationName
      ? tempHoldVariables?.profilePosition[i].geoLocationName
      : data.location;

    // if (data.location === "") return;
    tempHoldVariables?.profile?.map((e) => {
      if (
        e.name.toLowerCase() === tempHoldVariables.currentCompany.toLowerCase()
      ) {
        let outStr = "";

        const startMonth = e.timePeriod
          ? e.timePeriod.startDate
            ? e.timePeriod.startDate.month
            : "0"
          : "0";
        const startYear = e.timePeriod
          ? e.timePeriod.startDate
            ? e.timePeriod.startDate.year
            : "0000"
          : "0000";

        outStr += `From ${startMonth}-${startYear}`;
        if (e.timePeriod && e.timePeriod.endDate) {
          const endMonth = e.timePeriod
            ? e.timePeriod.endDate
              ? e.timePeriod.endDate.month
              : "0"
            : "0";
          const endYear = e.timePeriod
            ? e.timePeriod.endDate
              ? e.timePeriod.endDate.year
              : "0000"
            : "0000";
          outStr += ` to ${endMonth}-${endYear}`;
        } else {
          outStr += " to Present";
        }

        data.timeInCompany = outStr;
      }
    });

    console.log(max, " ", month, " ", i);
    fs.writeFileSync(
      "./tempData.json",
      JSON.stringify({ tempHoldVariables, find: { max, ind: i } })
    );
    dataset.push(data);

    await sleep(2000);
  }

  //  fs.writeFileSync("./data.json", JSON.stringify({ data: dataset }));

  const headings = [
    "LinkedIn Url",
    "Name",
    "Header",
    "Role",
    "Current Company",
    "Time In Company",
    "Location",
    "About",
  ];

  for (let i = 0; i < headings.length; i++) {
    ws.cell(1, i + 1).string(headings[i]);
  }

  let rowIndex = 2;
  dataset.forEach((record) => {
    ws.cell(rowIndex, 1).string(record["linkedinUrl"]);
    ws.cell(rowIndex, 2).string(record["name"]);
    ws.cell(rowIndex, 3).string(record["header"]);
    ws.cell(rowIndex, 4).string(record["role"]);
    ws.cell(rowIndex, 5).string(record["currentCompany"]);
    ws.cell(rowIndex, 6).string(record["timeInCompany"]);
    ws.cell(rowIndex, 7).string(record["location"]);
    ws.cell(rowIndex, 8).string(record["about"]);

    rowIndex++;
  });

  wb.write("data.xlsx");

  console.log("All done :)");
}

function loadCookies() {
  const f = fs.readFileSync("./cookies.txt");
  return f.toString().trim();
}

function getSessionId(cookiesStr) {
  const match = cookiesStr.match(/JSESSIONID="(.+?)"/);
  if (!match) return null;
  return match[1];
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

function removeCommas(str) {
  let output = str.replaceAll("\n", " ");
  return output.replaceAll(",", "");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getCompanyId(companyName) {
  const url = `https://www.linkedin.com/company/${companyName}/`;
  const headers = {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    Dnt: "1",
    "Sec-Ch-Ua":
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };

  const res = await fetch(url, {
    headers: headers,
  });

  const text = await res.text();
  const result = text.match(/urn:li:organization:([\d]+)/g);

  if (!result) return null;

  const arr = result[0].split(":");
  const id = arr[arr.length - 1];
  return id;
}

const range = (start, stop, step) =>
  Array.from({ length: (stop - start) / step + 1 }, (_, i) => start + i * step);

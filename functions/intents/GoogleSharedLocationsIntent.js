const NodeGeocoder = require('node-geocoder');
const request = require('request');
const cheerio = require('cheerio');
const haversine = require('haversine');
const levenshtein = require('fast-levenshtein').get;
const credentials = {
  "alexa": {
    "appid": process.env.ALEXA_APPID,
  },
  "google": {
    "username": process.env.GOOGLE_USERNAME,
    "password": process.env.GOOGLE_PASSWORD
  },
  "relativeLocation": {
    "name": process.env.LOCATION_NAME,
    "radius": process.env.LOCATION_RADIUS,
    "latitude": process.env.LOCATION_LAT,
    "longitude": process.env.LOCATION_LONG
  }
};
const geocoder = NodeGeocoder({
  provider: 'google',
  language: 'en',
});

/**
* @param {string} name
* @returns {string}
*/
module.exports = async (name) => {
  const hasGoogleCredentials = credentials.google && credentials.google.username && credentials.google.password;
  const hasRelativeLocation = credentials.relativeLocation && credentials.relativeLocation.latitude && credentials.relativeLocation.longitude;
  if (!hasGoogleCredentials) {
    return 'I need to authenticate using your Google account to access your shared locations.';
  }
  try {
    const user = await findUserByName(name)
    const locations = await geocoder.reverse({
      lat: user.latitude,
      lon: user.longitude,
    });
    const location = locations && locations[0];
    let distance = hasRelativeLocation && Math.round(haversine(user, credentials.relativeLocation, {
      unit: 'km',
    }));
    if (hasRelativeLocation) {
      if (distance <= credentials.relativeLocation.radius) {
        return `${user.name} is at ${credentials.relativeLocation.name}.`;
      } else {
        return `${user.name} is on ${location.streetName}, ${location.city}, ${location.country}, which is ${distance} kilometers away.`;
      }
    } else {
      return `${user.name} is on ${location.streetName}, ${location.city}, ${location.country}.`;
    }
  } catch (err) {
    console.error(err)
    return `Hmm.. I was not able to get ${name}\'s location`;
  }
};

/**
 * @param {string} name 
 * @example
 * findUserByName('omar')
 *   .then(console.log)
 *   .catch(console.error)
 */
async function findUserByName(name) {
  const lowerName = name.toLowerCase();
  const users = await getGoogleSharedLocations(credentials.google);
  const sortedUsers = users
    .map((user) => ({
      name: user.name,
      latitude: user.lat,
      longitude: user.long,
      m: levenshtein(user.name.toLowerCase(), lowerName),
    }))
    .sort((u1, u2) => u1.m - u2.m);
  const user = sortedUsers[0];
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

async function getGoogleSharedLocations(credentials) {
  const savedCookies = {
    'google.com': {}
  };
  console.log('connectFirstStage')
  const googleEmailForm = await connectFirstStage(savedCookies);
  googleEmailForm['Email'] = credentials.username;
  console.log('connectSecondStage')
  const googlePasswordForm = await connectSecondStage(savedCookies, googleEmailForm);
  googlePasswordForm['Passwd'] = credentials.password;
  console.log('connectThirdStage')
  await connectThirdStage(savedCookies, googlePasswordForm);
  console.log('getSharedLocations')
  const users = await getSharedLocations(savedCookies);
  console.log('ok', users)
  return users;
}

/**
 * Connect to Google, call login page
 * What we get here:
 * - GAPS cookie
 * - glx form identifier
 * 
 * If logins are being blocked, navigate to the following link and click allow
 * just before triggering the script.
 * 
 * https://accounts.google.com/b/0/DisplayUnlockCaptcha
 */
function connectFirstStage(savedCookies) {
  return new Promise((resolve, reject) => {
    // first get GAPS cookie
    request({
      url: "https://accounts.google.com/ServiceLogin",
      headers: {
        "Upgrade-Insecure-Requeste": "1",
        "Connection": "keep-alive"
      },
      method: "GET",
      qs: {
        "rip": "1",
        "nojavascript": "1",
        "flowName": "GlifWebSignIn",
        "flowEntry": "ServiceLogin"
      }
    }, function(err, response, body) {
      if (err || !response) {
        // no connection
        reject(err);
      } else {
        // connection successful
        // connection established but something went wrong
        if (response.statusCode !== 200) {
          reject(err);
        } else {
          // save cookies etc.
          if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
            setCookie(savedCookies, response.headers['set-cookie'], 'google.com');
          } else {
            reject(new Error('Google Authentication Stage 1 no Set-Cookie header'))
          }
          // first simply get all form fields
          const $ = cheerio.load(response.body);
          // console.log($.text().replace(/^\s+\n+/gm, '').replace(/Privacy[\w\W]+$/, ''));
          const error = $('.error-msg').text().trim();
          if (error) {
            reject(new Error(error));
          }
          const googleEmailForm = $("form").serializeArray()
            .reduce((r, x) => Object.assign({}, r, {
              [x.name]: x.value,
            }), {});
          resolve(googleEmailForm);
        }
      }
    });
  });
}

/**
 * We have the GAPS cookie and the glx identifier,
 * Start username nad password challenge now.
 */
function connectSecondStage(savedCookies, googleEmailForm) {
  return new Promise((resolve, reject) => {
    request({
      url: "https://accounts.google.com/signin/v1/lookup",
      headers: {
        "Cookie": getCookie(savedCookies, 'google.com'),
        "Referer": "https://accounts.google.com/ServiceLogin?rip=1&nojavascript=1",
        "Origin": "https://accounts.google.com"
      },
      method: "POST",
      form: googleEmailForm
    }, function(err, response, body) {
      if (err || !response) {
        // no connection
        reject(err);
      } else {
        // connection successful
        // save cookies etc.
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          setCookie(savedCookies, response.headers['set-cookie'], 'google.com');
        } else {
          reject(new Error('Google Authentication Stage 2 no Set-Cookie header'))
        }
        // first simply get all form fields
        const $ = cheerio.load(response.body);
        // console.log($.text().replace(/^\s+\n+/gm, '').replace(/Privacy[\w\W]+$/, ''));
        const error = $('.error-msg').text().trim();
        if (error) {
          reject(new Error(error));
        }
        const googlePasswordForm = $("form").serializeArray()
          .reduce((r, x) => Object.assign({}, r, {
            [x.name]: x.value,
          }), {});
        resolve(googlePasswordForm);
      }
    });
  });
}

/**
 * We have the GAPS cookie and the glx identifier,
 * Start username nad password challenge now.
 */
function connectThirdStage(savedCookies, googlePasswordForm) {
  return new Promise((resolve, reject) => {
    request({
      url: "https://accounts.google.com/signin/challenge/sl/password",
      headers: {
        "Cookie": getCookie(savedCookies, 'google.com'),
        "Referer": "https://accounts.google.com/signin/v1/lookup",
        "Origin": "https://accounts.google.com"
      },
      method: "POST",
      form: googlePasswordForm
    }, function(err, response, body) {
      if (err || !response) {
        // no connection
        reject(err);
      } else {
        // connection successful
        // save cookies etc.
        const $ = cheerio.load(response.body);
        // console.log($.text().replace(/^\s+\n+/gm, '').replace(/Privacy[\w\W]+$/, ''));
        // console.log(response.headers);
        const error = $('.error-msg').text().trim();
        if (error) {
          reject(new Error(error));
        }
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          setCookie(savedCookies, response.headers['set-cookie'], 'google.com');
        } else {
          reject(new Error('Google Authentication Stage 3 no Set-Cookie header'))
        }
        resolve();
      }
    });
  })
}

function getSharedLocations(savedCookies) {
  return new Promise((resolve, reject) => {
    request({
      url: "https://www.google.com/maps/preview/locationsharing/read",
      headers: {
        "Cookie": getCookie(savedCookies, 'google.com')
      },
      method: "GET",
      qs: {
        "authuser": 0,
        "pb": ""
      }
    }, function(err, response, body) {
      if (err || !response) {
        reject(err);
      } else {
        // connection successful
        // connection established but auth failure
        if (response.statusCode !== 200) {
          reject(new Error(`locationsharing responded with HTTP Status ${response.statusCode}`));
        } else {
          // Parse and save user locations
          const locationdata = JSON.parse(body.split('\n').slice(1, -1).join(''));
          // Shared location data is contained in the first element
          const perlocarr = locationdata[0] || [];
          const users = perlocarr.map(data => ({
            "id": data[0][0],
            "photoURL": data[0][1],
            "name": data[0][3],
            "lat": data[1] && data[1][1][2],
            "long": data[1] && data[1][1][1]
          }));
          // console.log(users)
          resolve(users);
        }
      }
    });
  })
}

/**
 * Compose the header cookie data.
 */
function getCookie(savedCookies, domain) {
  let cookieStr = '';
  for (var curcookie in savedCookies[domain]) {
    cookieStr = cookieStr + curcookie + '=' + savedCookies[domain][curcookie] + ';'
  }
  return cookieStr.slice(0, -1);
}

/**
 * Save cookies from Google.
 */
function setCookie(savedCookies, cookies, domain) {
  cookies.forEach(cookie => {
    const [
      key,
      value,
    ] = cookie.split(';')[0].split('=');
    savedCookies[domain][key] = value;
  });
}


const dotenv = require('dotenv').config();
const express = require("express")
const path = require('path')
const readline = require('readline');
const google = require('googleapis');
const googleAuth = require('google-auth-library');
const Promise = require('bluebird');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const csv = require('fast-csv');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const AWS = require('aws-sdk');
const request = require('request-promise');

///////////////////////// CONFIG ////////////////////////////////////////
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

nunjucks.configure('views', {
  autoescape: true,
  express   : app
});

const s3 = new AWS.S3({
  signatureVersion: 'v4'
});

const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
  '514158355522-p5apd6m0g6mloklqbbfjpphlfvabks13.apps.googleusercontent.com',
  '8pM2g9oKWjVNrkGYZ8wd8PTG',
  'urn:ietf:wg:oauth:2.0:oob'
);

const service = google.drive('v3');
const sheets = google.sheets('v4');

const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'drive-and-sheets-eventil.json';

//////////////// Authorization ////////////////////////
function authorize() {
  return new Promise((resolve, reject) => {
    readFile(TOKEN_PATH).then((token) => {
      oauth2Client.credentials = JSON.parse(token);
      return resolve(oauth2Client)
    }).catch(() => {
      return getNewToken(oauth2Client).then((result) => {
        return resolve(result)
      })
    });
  });
}

function getNewToken(oauth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
      rl.close();
      oauth2Client.getToken(code, function(err, token) {
        if (err) {
          console.log('Error while trying to retrieve access token', err);
          return;
        }
        oauth2Client.credentials = token;
        storeToken(token);
        resolve(oauth2Client)
      });
    });
  })
}

function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

//////////////// Functions based on Google API And AWS API////////////////////////

const list = Promise.promisify(service.files.list);
const readSheet = Promise.promisify(sheets.spreadsheets.values.batchGet);
const getSheets = Promise.promisify(sheets.spreadsheets.get);
const writeToStreamAsync = Promise.promisify(csv.writeToString);
const createBucketAsync = Promise.promisify(s3.createBucket.bind(s3));
const putObjectAsync = Promise.promisify(s3.putObject.bind(s3));
const headBucketAsync = Promise.promisify(s3.headBucket.bind(s3));

function getProjects() {
  const rootDirId = process.env.GOOGLE_ROOT_DIR
  return authorize()
    .then((credentials) => {
      return list({
        auth: credentials,
        fields: "files(id, name)",
        q: "mimeType='application/vnd.google-apps.spreadsheet' and '" + rootDirId + "' in parents and trashed=false"
      });
    }).catch((err) => {
      console.log(err)
    });
}

function getFiles(fileId, fileName, slug) {
  return authorize().then((credentials) => {
    return getSheets({
      auth: credentials,
      spreadsheetId: fileId,
    })
  }).then((result) => {
    const range = result.sheets[0].properties.title
    return authorize().then((credentials) => {
      return readSheet({
        auth: credentials,
        spreadsheetId: fileId,
        ranges: range
      })
    })
  }).then((result)=> {
    createConfigFiles(result, slug)
  });
}


function createConfigFiles(data, slug){
  console.log('Creating file');
  const worksheet = data.valueRanges[0]
  const csvData = worksheet.values
  writeToStreamAsync(csvData, {headers: true}).then((result) => {
    checkBucket(result, slug)
  })
}

function checkBucket(data, slug) {
  const bucketName = process.env.AWS_BUCKET_NAME
  headBucketAsync({Bucket:bucketName}).then(() => {
    storeCsvOnAws(data, slug, bucketName)
  }).catch(() => {
    createBucketAsync({Bucket: bucketName}).then(() => {
      storeCsvOnAws(data, slug, bucketName)
    })
  })
}

function storeCsvOnAws(data, slug, bucketName) {
  const csvFileName = `sources/${slug}.csv`
  const params = {Bucket: bucketName, Key: csvFileName , Body: data, ACL: 'public-read'};
  putObjectAsync(params).then(() => {
    console.log("Successfully uploaded data to " + bucketName + "/" + csvFileName);
    sendRequestToEventil(slug)
  })
}

function sendRequestToEventil(slug) {
  const url = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/sources/${slug}.csv`
  const options = {
    method: 'POST',
    url: `https://eventil.com/events/${slug}/add_speaker_participations`,
    form: {
      url: url
    }
  };
  console.log(options)
  console.log('Sending csv data to Eventil, event:' + slug);
  request(options).then((parsedBody) => {
    console.log(parsedBody)
  }).catch( (err) => {
    console.log(err.message + 'Request Options: ' + JSON.stringify(err.options))
  });
}

///////////////// Routes //////////////////////////////////////////
app.get('/', (req, res) => {
  getProjects().then((result) => {
    return res.render('index.html', {
      files: result.files
    });
  });
});

app.post('/import', (req, res) => {
  const FileId = req.body.file_id
  const FileName = req.body.file_name
  const slug = req.body.slug
  getFiles(FileId, FileName, slug)
  return res.redirect(302, '/');
});

app.listen(3000, () => {
  console.log('listening on 3000')
})

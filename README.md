## README

This is simple Node application that lists spreadshets and imports them to Eventil.

### Installation

Install dependencies using [yarn][1]

    yarn


### Environment variables

Put all environment variables into `.env`.

List of all env vars in `.env.example`.

Create in your home directory folder ```.aws``` and inside this folder file ```credentials```. Paste there

```
[default]

aws_access_key_id = YOUR_AWS_ACCESS_KEY_ID

aws_secret_access_key = YOUR_AWS_SECRET_KEY_ID

```

### Google Drive and Google Sheets API
Create Google project and configure Sheets access. Follow Step 1. from this tutorial:
https://developers.google.com/sheets/api/quickstart/nodejs

and then visit your google developers console:
https://console.developers.google.com/ - choose your project and enable Drive API.

While the first running App you'll be asked about authorization App. Follow instructions printed in console -  visit given url and paste given code in console.

### Usage

 `yarn run dev`

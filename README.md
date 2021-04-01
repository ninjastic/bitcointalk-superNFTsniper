# How to use

* Copy `settings.example.json` to `settings.json`
* Setup your BitcoinTalk `username`, `password`, `captchaCode` and `rules` for sniping.
* Run `yarn` or `npm install` to install the dependencies.
* Run `yarn start` or `npm run start` to start the script

## How to setup price rules

* `ALL` price relates to the minimum price to snipe any NFT.
* All other levels can have their own minimum price.

```
"rules": {
    "ALL": 2,
    "IV": 50,
    "V": 60,
    "VI": 70,
    "VII": 80,
    "VIII": 80,
    "IX": 80,
    "X": 80,
    "XI": 100
}
```

## How to get the captcha code

* Login to your BitcoinTalk account
* Go to https://bitcointalk.org/captcha_code.php
* Copy everything after `;ccode=`

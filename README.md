# Alexa Google Location Sharing Skill

## Disclosure

Google does not provide an official API for retrieving shared location data so
please be aware that this script authenticates using username and password with
Google.

Not only might the undocumented API may change without any warning, Google's 
security measures blocks authentication if your activity was considered unusual
(see ["Unusual traffic from your computer network"](https://support.google.com/websearch/answer/86640?hl=en)).

So yeah, don't expect this script to work flawlessly.

## Description

An Alexa skill that can retrieve the locations of users that are
sharing their location via Google shared locations.

For this script to work, you will need to provide a username and password to
a Google account.

I **highly recommend** creating a new Google account just for this script
and sharing your location with your new account.

*Note: It can not retrieve the location of the user that is used to access Google.*

## Usage

> alexa, ask shared locations: Where is {name}?

## Troubleshooting

* Alexa is responding with "Hmm, I was not able to get {name}'s location"
  * Confirm to Google you tried to login https://myaccount.google.com/device-activity
  * https://myaccount.google.com/notifications
  * *Allow less secure apps: ON* https://myaccount.google.com/security
  * Go to https://accounts.google.com/DisplayUnlockCaptcha and try again
  * Additionally ensure that two factor authentication is turned off.

## Fork

Forked from [t4qjXH8N/ioBroker.google-sharedlocations](https://github.com/t4qjXH8N/ioBroker.google-sharedlocations).

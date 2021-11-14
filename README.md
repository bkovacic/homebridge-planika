
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Homebridge Planika Fireplace Plugin

This is a Homebridge plugin to control [Planika](http://planikafires.com/) fireplaces. It exposes Lightbulb accessory that represents a fireplace. It can be turn on/off and flame size could be set like dimming the lighbulb.

Config is simple, just specify IP of your Planika fireplace and pick a name how you'd like to have it presented in Homekit apps.

Example:
```
{
    "name": "Fireplace",
    "IP": "192.168.69.30",
    "platform": "Planika"
}
```

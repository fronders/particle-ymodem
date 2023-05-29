# particle-ymodem
Fork changelog:
- removed SerialPort `open()` and `close()` calls
- added crc to packets, previously it was forced `00 00 ¯\_(ツ)_/¯`
- fixed header packet with file info (filename, size, modtime and attributes)
- moved fs inside the module
- added last packet EOF `0x1A` padding

Basic implementation of the Ymodem-protocol as used in Particle devices. Currently created and tested only to send firmware files to a Particle Photon.

##### Install using NPM
```
npm install particle-ymodem
npm install serialport
```

##### Use in application

```js
var lightYModem = require('particle-ymodem');
var serialPort = require("serialport");

var filepath = './firmware.bin';
var serialPort = new serialPort.SerialPort('/dev/cu.usbmodemfd131', { baudrate: 28800 }, false);
var progressCallback = function (val) { console.log(Math.round(val.current * 100 / val.total) + '%'); }
var logCallback = console.log;

var modem = new lightYModem();
modem.transfer(filepath, serialPort, progressCallback, logCallback);
```


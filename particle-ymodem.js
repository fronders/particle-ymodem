'use strict';
const fs = require('fs')
const path = require('path');
const crc16 = require('crc/calculators/crc16xmodem');

var LightYModem = module.exports = function LightYModem() {
    if (typeof this === 'undefined') {
        throw 'class not instantiated with "new"';
    }
    var self = this;

    self.seq = 0;
    self.ymodem = null;
    self.consoleLog = function() {};
    self.progressCb = function() {};
    self.finishedCb = function() {};

    self.write = function write(packet, cb) {
        var timer;
        self.ymodem.write(packet, function (err, res) {
            if (err) {
                self.consoleLog('error:', err);
            } else if (res === -1) {
                self.consoleLog('result is -1'); // res values are undocumented, it seems like an error, and when it is send, the callback is called twice.
            } else if (cb) {
                cb();
            }
        });
        return packet.length;
    }

    self._get_packet_len = function _get_packet_len(mark) {
        var packet_len;
        if (mark === LightYModem.soh) {
            packet_len = LightYModem.packet_len_soh
        } else if (mark === LightYModem.stx) {
            packet_len = LightYModem.packet_len_stx
        } else { 
            throw ('packet mark is wrong!');
        }
        return packet_len;
    }

    self._send_ymodem_packet = function _send_ymodem_packet(mark, data, cb) {
        var packet_len = self._get_packet_len(mark);
        data = Buffer.concat([data, Buffer.alloc(packet_len - data.length)], packet_len);
        var pktmark = Buffer.from([mark & 0xFF])
        var seqchr = Buffer.from([self.seq & 0xFF]);
        var seqchr_neg = Buffer.from([(-self.seq - 1) & 0xFF]);
        var crc = Buffer.allocUnsafe(2);
        crc.writeUInt16BE(crc16(data))
        var packet = Buffer.concat([pktmark, seqchr, seqchr_neg, data, crc]);
        if (packet.length != packet_len + LightYModem.packet_len_overhead) {
            throw ('packet length is wrong!');
        }

        self.ymodem.once('data', function (data) {
            var response = data[0];
            self.consoleLog('sent packet #', self.seq);
            self.seq += 1;
            cb(response);
        });
        self.write(packet);
    }

    self._send_close = function _send_close() {
        self.consoleLog('closing');
        self.ymodem.write(Buffer.from([LightYModem.eot]), function () {
            self.consoleLog('eot sent');
            self.send_filename_header('', function () {
                self.consoleLog('empty header sent');
            });
            setTimeout(function () {
                self.consoleLog('finished');
                self.finishedCb();
            }, 0);
        });
    };

    self.send_packet = function send_packet(file, cb) {
        const mark = LightYModem.packet_mark;
        var sendSlice = function (offset) {
            const packet_len = self._get_packet_len(mark);
            var lower = offset * packet_len;
            var higher = ((offset + 1) * packet_len);
            if (higher >= file.length) {
                higher = file.length;
            }
            self.progressCb({
                current: lower < file.length ? lower : file.length,
                total: file.length
            });
            if (lower >= file.length) {
                cb();
            } else {
                var buf = file.slice(lower, higher);
                self._send_ymodem_packet(mark, buf, function () {
                    sendSlice(offset + 1);
                });
            }
        }
        sendSlice(0);
    }

    self.send_filename_header = function send_filename_header(file, cb) {
        self.seq = 0;   // reset sequence number
        var filenameHeader;
        if (file !== '' && fs.existsSync(file)) {
            // constuct file info header
            const stats = fs.statSync(file)
            const fileName = path.parse(file).base
            const fileSize = stats.size.toString();
            const modTime = Math.floor(stats.mtimeMs / 1000).toString(8);
            const unixFilePermissions = '100' + (stats.mode & parseInt('777', 8)).toString(8);
            filenameHeader = Buffer.from(fileName + '\0' + fileSize + ' ' + modTime + ' ' + unixFilePermissions);  
        } else {
            filenameHeader = Buffer.alloc(0);
        }
        self.consoleLog('header', filenameHeader.toString('hex'));
        self._send_ymodem_packet(LightYModem.header_mark, filenameHeader, cb);
    }


    self.transfer = function transfer(file, ymodem, progressCb, finishedCb, consoleOutput) {
        self.ymodem = ymodem;
        self.consoleLog = consoleOutput || self.consoleLog;
        self.progressCb = progressCb || self.progressCb;
        self.finishedCb = finishedCb || self.finishedCb;
        const file_data = fs.readFileSync(file);

        self.ymodem.on('error', function (msg) {
            self.consoleLog('error:', msg);
        });
        // self.ymodem.on('close', function() {
        //     self.consoleLog('finished');
        //     finishedCb();
        // });
        // self.ymodem.on('open', function (error) {
        //     if(error) {
        //         self.consoleLog('open 2 error', error);
        //     }
        self.ymodem.on('data', function (data) {
            if (data.length <= 2) {
                for (var x = 0; x < data.length; x++) {
                    for (var key in LightYModem) {
                        if (data[x] === LightYModem[key]) {
                            self.consoleLog('cmd received:', key);
                        }
                    }
                }
            } else {
                self.consoleLog('message received:', data.toString().trim());
            }
        });
        self.send_filename_header(file, function () {
            self.consoleLog('done header');
            self.send_packet(file_data, function (response) {
                self.consoleLog('done file');
                self._send_close();
            });
        });

        // });
        // self.ymodem.open();
    }

    return self;
};
LightYModem.soh = 1;     // 128 byte blocks
LightYModem.stx = 2;     // 1K blocks
LightYModem.eot = 4;
LightYModem.ack = 6;
LightYModem.nak = 0x15;
LightYModem.ca = 0x18;    // 24
LightYModem.crc16 = 0x43;  // 67
LightYModem.abort1 = 0x41; // 65
LightYModem.abort2 = 0x61; // 97

LightYModem.packet_len_overhead = 5;
LightYModem.packet_len_soh = 128;
LightYModem.packet_len_stx = 1024;

LightYModem.header_mark = LightYModem.soh;
// LightYModem.packet_mark = LightYModem.soh;  // 128B blocks
LightYModem.packet_mark = LightYModem.stx;  // 1kB blocks


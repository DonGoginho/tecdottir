var Moment = require('moment');
var Async = require('async');
var Request = require('superagent');
var Cheerio = require('cheerio');
var Encoding = require("encoding");
var _ = require('lodash');

exports.getMeasurements = getMeasurements;
exports.measurements = measurements;

function measurements(req, res) {
  var station = req.swagger.params.station.value;
  var startDate = req.swagger.params.startDate.value || Moment();
  var endDate = req.swagger.params.endDate.value || Moment();

  getMeasurements(station, startDate, endDate, function(err, values) {
      var result;
      if (err) {
          result = {
              ok: false,
              message: err
          };
      } else {
          result = {
              ok: true,
              result: values
          };
      }
    
      res.json(result);
  });
}

function getMeasurements(station, startDate, endDate, callback) {
    var startDateObj = Moment(startDate);
    var endDateObj = Moment(endDate);

    Request
        .post('https://www.tecson-data.ch/zurich/tiefenbrunnen/uebersicht/messwerte.php')
        .type('form')
        .responseType('blob')
        .send({'messw_beg': startDateObj.format('DD.MM.YYYY')})
        .send({'messw_end': endDateObj.format('DD.MM.YYYY')})
        .send({'auswahl': 2})
        .send({'combilog': station})
        .end(function(err, res) {
            if (err) {
                callback('Tecson returned an error: ' + err);
                return;
            }
            // when responseType is set to 'blob' res.body is a buffer containing the content
            // the content is ISO-8859-1 encoded, we convert it to UTF-8
            var contentBuffer = Encoding.convert(res.body, 'utf8', 'latin1');
            var $ = Cheerio.load(contentBuffer);

            var headers = [];
            var values = [];
            $('table').eq(1).filter(function() {
                var table = $(this);
                var rows = table.find('tr');

                //extract the headers
                $(rows[0]).find('td').each(function(i, elem) {
                    var headerText = $(this).find('span').eq(0).text();
                    var unitText = $(this).find('span').eq(1).text();
                    headers.push(
                        {
                            'text': headerText,
                            'unit': unitText.trim().replace(/[\(\)]/g, '')
                        }
                    );
                });
                
                //remove the header row from rows
                rows.splice(0, 1);

                //extract the values
                $(rows).each(function(i, elem) {
                    var row = $(this);
                    var valueSet = {};
                    $(row).find('td').each(function(i, elem) {
                        var valueText = $(this).find('span').text();
                        valueSet[headers[i].text] = {
                            "value": valueText,
                            "unit": headers[i].unit
                        };
                    }).get();
                    values.push({
                        station: station,
                        timestamp: Moment(valueSet['Datum / Uhrzeit (MEZ)'].value, 'DD.MM.YYYY HH:mm:ss').toISOString(),
                        values: valueSet
                    });
                }).get();
            });
            callback(null, values);

        });
}
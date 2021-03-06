import moment from "moment";

var UtilService = {
  data() {
    return {
      filterValuesCacheDuration: false,
    }
  },
  methods: {
    sortByProperty(property) {
      return function (a, b) {
        if (a[property] < b[property]) {
          return -1;
        }
        if (a[property] > b[property]) {
          return 1;
        }
        return 0;
      }
    },
    isFilterInView(filter) {
      const section = this.$route.meta.section;
      const view = this.$route.meta.view;

      if (section && view) {
        return this.getQueueReportViewFilterMap()[section][view].includes(filter);
      } else {
        return false;
      }
    },
    getQueueReportViewFilterMap() {
      return {
        "dashboard": {
          "default": ["time", "queue", "agent", "ivr", "choice"],
        },
        "data": {
          "summary": ["timeGroup", "time", "queue", "agent"],
          "agent": ["timeGroup", "time", "queue", "agent"],
          "session": ["time", "hour", "queue", "reason", "agent"],
          "caller": ["timeGroup", "time", "queue", "caller", "contactName"],
          "call": ["time", "hour", "queue", "caller", "contactName", "agent", "result"],
          "lost_call": ["timeGroup", "time", "queue", "caller", "contactName", "reason"],
          "ivr": ["timeGroup", "time", "ivr", "choice"]
        },
        "performance": {
          "default": ["timeGroup", "time", "queue"]
        },
        "distribution": {
          "hourly": ["timeGroup", "time", "queue", "timeSplit", "agent", "ivr"],
          "geographic": ["timeGroup", "time", "queue", "origin"],
        },
        "graphs": {
          "load": ["timeGroup", "time", "queue", "origin"],
          "hour": ["time", "queue", "agent", "destination", "ivr", "choice"],
          "agent": ["timeGroup", "time", "queue", "agent"],
          "area": ["timeGroup", "time", "queue"],
          "queue_position": ["time", "queue", "timeSplit"],
          "avg_duration": ["time", "queue", "timeSplit"],
          "avg_wait": ["time", "queue", "timeSplit"]
        }
      }
    },
    saveToLocalStorageWithExpiry(key, item, ttlMinutes) {
      // save an object to local storage attaching its expiry date
      const expiry = new Date().getTime() + ttlMinutes * 60 * 1000;
      this.set(key, { item: item, expiry: expiry });
    },
    formatValue(value, format) {
      switch (format) {
        case "num":
          return this.$options.filters.formatNumber(value);
        case "seconds":
          return this.$options.filters.formatTime(value);
        case "percent":
          return this.$options.filters.formatPercentage(value);
        case "label":
          return this.$i18n ? this.$i18n.t(value) : value;
        case "yearDate":
          // no formatting needed
          return value;
        case "monthDate":
          return this.$options.filters.formatMonthDate(value, this.$i18n);
        case "weekDate":
          return this.$options.filters.formatWeekDate(value, this.$i18n);
        case "dayDate":
          // no formatting needed
          return value;
      }
    },
    watchDataLineOrBarChart(that) {
      if (!that.data || that.data.length <= 1) {
        // no data
        return;
      }

      that.labels = [];
      that.datasets = [];

      // remove first element (query columns)
      let rows = that.data.filter((_, i) => i !== 0);

      // if there are too many datasets, keep only most relevant ones
      rows = that.checkTooManyDataLineOrBarChart(rows, that);

      // build a data structure (datasetMap) like this:
      // {
      //   datasetName: {2018: 0, 2019: 18, 2020: 4}
      //   otherDatasetName: {2018: 0, 2019: 39, 2020: 210}
      //   yetAnotherDataset: {2018: 0, 2019: 526, 2020: 28}
      // }

      let labelSet = new Set();
      let datasetNameSet = new Set();
      let datasetMap = {};
      let officeHoursLabels = false;

      // if labels match HH:mm, generate all labels using office hours and time split
      if (/^[0-2][0-9]:[0-5][0-9]$/.test(rows[0][1])) {
        officeHoursLabels = true;
        labelSet = that.generateTimeLabelsLineOrBarChart(that.officeHours, that.filterTimeSplit, that);
      }

      rows.forEach((row) => {
        datasetNameSet.add(row[0]);

        if (!officeHoursLabels) {
          labelSet.add(row[1]);
        }
      });

      datasetNameSet.forEach((datasetName) => {
        datasetMap[datasetName] = {};
      });

      rows.forEach((row) => {
        const datasetName = row[0];
        const label = row[1];
        const value = parseFloat(row[2]);

        datasetMap[datasetName][label] = value;
      });

      that.labels = Array.from(labelSet).sort();

      // add missing data with zero values

      for (const [datasetName, data] of Object.entries(datasetMap)) {
        const labels = Object.keys(data);
        let missingLabels = that.labels.filter((l) => !labels.includes(l));

        missingLabels.forEach((missingLabel) => {
          datasetMap[datasetName][missingLabel] = 0;
        });
      }

      // initialize chart data

      Object.entries(datasetMap).forEach(([datasetName, data]) => {
        const sortedLabels = Object.keys(data).sort();
        let datasetValues = [];

        sortedLabels.forEach((label) => {
          datasetValues.push(data[label]);
        });

        that.datasets.push({
          label: this._.upperFirst(datasetName),
          data: datasetValues,
          fill: false,
        });
      });

      // render chart

      const chartData = {
        labels: that.labels,
        datasets: that.datasets,
      };
      that.chartData = chartData;
      that.renderChart(that.chartData, that.options);
    },
    parseTableChartHeader(rawColumn) {
      const colRegex = /^([^$£#]+)(?:£([^$£#]+))?(?:\$([^$£#]+)(?:£([^$£#]+))?(#)?)?(?:\$([^$£#]+)(?:£([^$£#]+))?(#)?)?$/;
      const match = colRegex.exec(rawColumn);

      return {
        topHeaderName: match[1],
        topHeaderFormat: match[2],
        middleHeaderName: match[3],
        middleHeaderFormat: match[4],
        middleHeaderHidable: match[5],
        bottomHeaderName: match[6],
        bottomHeaderFormat: match[7],
        bottomHeaderHidable: match[8],
      };
    },
    checkTooManyDataLineOrBarChart(rows, that) {
      const datasetSet = new Set();
      let tooMany = false;

      for (let row of rows) {
        datasetSet.add(row[0]);

        if (datasetSet.size > that.MAX_ENTRIES) {
          tooMany = true;
          break;
        }
      }

      if (!tooMany) {
        // return all input rows
        return rows;
      } else {
        // too many entries, merge some of them
        return that.mergeMinorEntriesLineOrBarChart(rows, that);
      }
    },
    mergeMinorEntriesLineOrBarChart(rows, that) {
      let datasetTotalMap = {};

      rows.forEach((row) => {
        const datasetName = row[0];
        const datasetValue = Number(row[2]);

        if (datasetTotalMap[datasetName] === undefined) {
          datasetTotalMap[datasetName] = 0;
        }
        datasetTotalMap[datasetName] += datasetValue;
      });

      const datasetTotalList = Object.keys(datasetTotalMap).map((datasetName) => {
        return { name: datasetName, total: datasetTotalMap[datasetName] }
      });

      // sort
      const datasetTotalListSorted = datasetTotalList.sort(that.sortByProperty("total")).reverse();

      // extract most relevant datasets
      const topDatasetNames = datasetTotalListSorted.filter((_, i) => i < that.MAX_ENTRIES - 1).map(dataset => dataset.name);
      let topDatasetsRows = [];
      let others = {};

      rows.forEach(row => {
        const datasetName = row[0];

        if (topDatasetNames.includes(datasetName)) {
          topDatasetsRows.push(row);
        } else {
          // put data into "Others" dataset
          const label = row[1];
          const value = Number(row[2]);

          if (others[label] === undefined) {
            others[label] = 0;
          }
          others[label] += value;
        }
      });

      let othersRows = [];

      for (const [label, value] of Object.entries(others)) {
        othersRows.push([that.$i18n.t("misc.others"), label, value]);
      }

      return topDatasetsRows.concat(othersRows);
    },
    getMomentStartOfHour(timeString) {
      // returns a moment object that represents today at the start of hour specified by timeString
      // e.g. timestring: 09:35 -> 09:00
      // e.g. timestring: 10:00 -> 10:00
      let momentTime = moment().zone('GMT');

      // timeString is expressed in HH:mm format
      let hhmm = timeString.split(/:/);
      momentTime.hours(parseInt(hhmm[0])).startOf('hour');
      return momentTime;
    },
    getMomentNextHour(timeString) {
      // returns a moment object that represents today at the next hour specified by timeString
      // e.g. timestring: 09:25 -> 10:00
      // e.g. timestring: 10:00 -> 10:00
      let momentTime = moment().zone('GMT');

      // timeString is expressed in HH:mm format
      let hhmm = timeString.split(/:/);

      momentTime.hours(parseInt(hhmm[0])).minutes(parseInt(hhmm[1])).seconds(0).milliseconds(0);

      if (momentTime.minutes() == 0) {
        return momentTime;
      } else {
        return momentTime.startOf('hour').add(1, 'hour');
      }
    },
    generateTimeLabelsLineOrBarChart(officeHours, timeSplit, that) {
      let labelSet = new Set();
      const officeHoursStartString = officeHours.startHour;
      const officeHoursEndString = officeHours.endHour;
      let hourStart = that.getMomentStartOfHour(officeHoursStartString);
      let hourEnd = that.getMomentNextHour(officeHoursEndString);
      let currentTime = hourStart;

      while (currentTime.isBefore(hourEnd)) {
        labelSet.add(currentTime.format("HH:mm"));
        currentTime.add(timeSplit, "minutes");
      }
      labelSet.add(currentTime.format("HH:mm"));
      return labelSet;
    },
    generateHoursMap(officeHours, timeSplit, that) {
      const officeHoursStartString = officeHours.startHour;
      const officeHoursEndString = officeHours.endHour;

      let hourStart = that.getMomentStartOfHour(officeHoursStartString);
      let hourEnd = that.getMomentNextHour(officeHoursEndString);

      let currentHourString = hourStart.format("HH:mm");
      let hoursMap = {};
      hoursMap[currentHourString] = [currentHourString];
      let currentTime = hourStart.add(timeSplit, "minutes");

      while (currentTime.isBefore(hourEnd)) {
        let currentTimeString = currentTime.format("HH:mm");

        if (currentTime.minutes() == 0) {
          hoursMap[currentTimeString] = [currentTimeString];
          currentHourString = currentTimeString;
        } else {
          hoursMap[currentHourString].push(currentTimeString);
        }
        currentTime.add(timeSplit, "minutes");
      }
      let currentTimeString = currentTime.format("HH:mm");
      hoursMap[currentTimeString] = [currentTimeString];
      return hoursMap;
    }
  }
};
export default UtilService;

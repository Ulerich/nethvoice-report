<template lang="html">
<div>
  <div v-show="!dataAvailable" class="ui placeholder segment report-data-not-available">
    <div class="ui icon header">
      <i class="frown outline icon mg-bottom-sm"></i>
      {{ $t("message.come_back_tomorrow") }}
    </div>
    <div class="inline">
      {{ $t("message.come_back_tomorrow_desc") }}
    </div>
  </div>
  <div v-show="dataAvailable">
    <div v-if="!$root.filtersReady">
      <sui-loader active centered inline class="mg-bottom-sm" />
      <div>{{ $t("message.loading_filters") }}...</div>
    </div>
    <div class="chart-container">
      <div
        v-for="(chart, index) in charts" v-bind:key="index"
        :id="`export_${index}`"
        :class="{'table-chart': chart.type == 'table', 'line-chart': chart.type == 'line', 'pie-chart': chart.type == 'pie', 'bar-chart': chart.type == 'bar'}"
      >
        <div class="align-center h-20">
          <h4 is="sui-header" class="chart-caption">
            {{ $t("caption." + chart.caption) }}
          </h4>
          <span v-if="chart.doc">
            <sui-popup flowing hoverable position="top center">
              <div class="chart-doc">
                <VueShowdown :markdown="chart.doc"></VueShowdown>
              </div>
              <sui-icon name="info circle" class="chart-doc-icon" slot="trigger" />
            </sui-popup>
          </span>
          <span v-if="chart.queryLimitHit">
            <sui-popup flowing hoverable position="top center">
              <div class="chart-query-limit">
                <VueShowdown :markdown="queryLimitMessage"></VueShowdown>
              </div>
              <sui-icon name="exclamation triangle" class="chart-query-limit-icon" slot="trigger" />
            </sui-popup>
          </span>
        </div>
        <div class="export-container">
          <ExportData
            :data="chart.data"
            :filename="$t(`caption.${chart.caption}`)"
            :pdfElementContainerId="`#export_${index}`"
            pdfElementHeaderClass=".header"
            :type="chart.type"
          />
        </div>
        <div v-show="!chart.data">
            <div v-if="chart.error">
              <sui-message error>
                <i class="circle times icon"></i>{{ $t("message.chart_error") }}
              </sui-message>
            </div>
            <div v-else-if="chart.message">
              <sui-message warning>
                <i class="exclamation triangle icon"></i>{{ $t("message." + chart.message) }}
              </sui-message>
            </div>
            <sui-loader v-else active centered inline class="loader-height" />
        </div>
        <div v-show="chart.data">
          <div v-show="chart.data && chart.data.length < 2">
            <!-- no data, only query header is present -->
            <sui-message warning>
              <i class="exclamation triangle icon"></i>{{ $t("message.no_data_for_current_filter") }}
            </sui-message>
          </div>
          <div v-show="chart.data && chart.data.length > 1">
            <!-- table chart -->
            <div v-if="chart.type == 'table'">
              <TableChart :caption="chart.caption" :data="chart.data" :chartKey="`${index}`" :officeHours="officeHours" :filterTimeSplit="filterTimeSplit" />
            </div>
            <!-- line chart -->
            <div v-if="chart.type == 'line'">
              <line-chart :data="chart.data" :caption="chart.caption" :officeHours="officeHours" :filterTimeSplit="filterTimeSplit"></line-chart>
            </div>
            <!-- bar chart -->
            <div v-if="chart.type == 'bar'">
              <bar-chart :data="chart.data" :caption="chart.caption" :type="chart.type" :officeHours="officeHours" :filterTimeSplit="filterTimeSplit"></bar-chart>
            </div>
            <!-- pie chart -->
            <div v-if="chart.type == 'pie'">
              <pie-chart :data="chart.data" :caption="chart.caption"></pie-chart>
            </div>
          </div>
        </div>
        <div v-show="chart.details" class="show-details">
          <sui-button type="button" size="tiny" icon="zoom" @click.native="showDetailsModal(chart)">
            {{ $t("command.show_details") }}
          </sui-button>
        </div>
      </div>
    </div>
    <!-- show details modal -->
    <sui-form @submit.prevent="hideDetailsModal()">
      <sui-modal v-if="chartDetails" v-model="openDetailsModal" size="small">
        <sui-modal-header>{{ $t("caption." + chartDetails.caption) }}</sui-modal-header>
        <sui-modal-content scrolling ref="chartDetailsContent">
          <TableChart :minimal="true" :caption="chartDetails.caption" :data="chartDetails.data" class="chart-details"/>
        </sui-modal-content>
        <sui-modal-actions>
          <sui-button type="submit" primary>
            {{ $t("command.close") }}
          </sui-button>
        </sui-modal-actions>
      </sui-modal>
    </sui-form>
  </div>
</div>
</template>

<script>
import TableChart from "../components/TableChart.vue";
import LineChart from "../components/LineChart.vue";
import BarChart from "../components/BarChart.vue";
import PieChart from "../components/PieChart.vue";
import ExportData from "../components/ExportData.vue";

import QueriesService from "../services/queries";
import StorageService from "../services/storage";
import UtilService from "../services/utils";
import SettingsService from "../services/settings";

export default {
  name: "QueueDashboard",
  components: { TableChart, LineChart, BarChart, ExportData, PieChart },
  mixins: [StorageService, QueriesService, UtilService, SettingsService],
  data() {
    return {
      queryTree: null,
      queryNames: [],
      charts: [],
      MAX_CHART_ENTRIES: 8,
      openDetailsModal: false,
      chartDetails: null,
      dataAvailable: true,
      officeHours: {
        start_hour: null,
        end_hour: null,
      },
      queryLimit: 0,
      filterTimeSplit: 0,
      isAdmin: 0,
      queryLimitMessage: "",
    };
  },
  mounted() {
    // event "dataNotAvailable" is triggered by $http interceptor if report tables don't exist yet
    this.$root.$off("dataNotAvailable", this.onDataNotAvailable); // avoid multiple event listeners
    this.$root.$on("dataNotAvailable", this.onDataNotAvailable);

    this.$root.$off("applyFilters", this.applyFilters); // avoid multiple event listeners
    this.$root.$on("applyFilters", this.applyFilters);

    // get office hours
    this.getAdminSettings();

    // $root.filtersReady is set to true when filters have been loaded
    if (this.$root.filtersReady) {
      this.retrieveQueryTree();
    }

    // check admin user
    if (this.get("loggedUser") && this.get("loggedUser").username == "admin") {
      this.isAdmin = true;
    } else {
      this.isAdmin = false;
    }

    // load message for query limit hit
    this.retrieveQueryLimitMessage();
  },
  watch: {
    $route: function () {
      this.initCharts();
    },
    "$root.filtersReady": function () {
      // $root.filtersReady is set to true when filters have been loaded
      if (this.$root.filtersReady) {
        this.retrieveQueryTree();
      }
    },
  },
  methods: {
    onDataNotAvailable() {
      this.dataAvailable = false;
    },
    retrieveQueryTree() {
      this.getQueryTree(
        (success) => {
          let queryTree = success.body.query_tree;

          for (const section of Object.keys(queryTree)) {
            for (const view of Object.keys(queryTree[section])) {
              queryTree[section][view].forEach(function (query, index) {
                const tokens = query.split(".");
                const queryName = tokens[0];
                const queryType = tokens[1];
                this[index] = { name: queryName, type: queryType };
              }, queryTree[section][view]);
            }
          }
          this.queryTree = queryTree;
          this.initCharts();
        },
        (error) => {
          console.error(error.body);
        }
      );
    },
    initCharts() {
      if (this.dataAvailable) {
        let charts = [];

        this.queries = this.queryTree[this.$route.meta.section][
          this.$route.meta.view
        ];

        if (this.queries) {
          this.queries.forEach((query) => {
            const queryName = query.name;
            const queryType = query.type;
            const tokens = queryName.split("_");
            const position = parseInt(tokens[0]);
            const chartType = tokens[1];
            const caption = tokens[2];
            const doc = this.retrieveDoc(queryName);
            charts.push({
              name: queryName,
              position: position,
              type: chartType,
              queryType: queryType,
              caption: caption,
              data: null,
              message: null,
              details: null,
              error: false,
              doc: doc,
              queryLimitHit: false,
            });
          });
          this.charts = charts.sort(this.sortByProperty("position"));
          this.$root.$emit("requestApplyFilter");
        } else {
          this.charts = [];
        }
      }
    },
    applyFilters(filter) {
      this.filterTimeSplit = Number(filter.time.division);

      for (let chart of this.charts) {
        chart.data = null;
        chart.message = null;
        chart.details = null;
        chart.error = false;
        chart.queryLimitHit = false;

        this.execQuery(
          filter,
          this.$route.meta.section,
          this.$route.meta.view,
          chart.name,
          chart.queryType,
          (success) => {
            const result = success.body;

            // check warning message
            if (
              result.length == 2 &&
              result[0].length == 1 &&
              result[0][0] == "!message"
            ) {
              chart.message = result[1][0].replace(/ /g, "_");
            } else {
              chart.data = result;

              // show details button for pie chart with a lot of entries
              if (this.tooMuchData(chart)) {
                chart.details = true;
              }

              // check if query limit has been hit
              if (chart.data.length && chart.data.length -1 == this.queryLimit) {
                chart.queryLimitHit = true;
              }
            }
          },
          (error) => {
            console.error(error.body);
            chart.error = true;
          }
        );
      }
    },
    tooMuchData(chart) {
      if (chart.type == "pie") {
        return chart.data.length > this.MAX_CHART_ENTRIES;
      } else if (chart.type == "line" || chart.type == "bar") {
        // remove first element (query columns)
        const rows = chart.data.filter((_, i) => i !== 0);
        const datasetSet = new Set();

        for (let row of rows) {
          datasetSet.add(row[0]);

          if (datasetSet.size > this.MAX_CHART_ENTRIES) {
            return true;
          }
        }
      } else {
        return false;
      }
    },
    showDetailsModal(chart) {
      this.chartDetails = chart;
      this.openDetailsModal = true;

      // scroll modal to top
      this.$nextTick(() => {
        this.$refs.chartDetailsContent.$el.scrollTop = 0;
      });
    },
    hideDetailsModal() {
      this.openDetailsModal = false;
    },
    getAdminSettings() {
      this.getSettings(
        (success) => {
          const settings = success.body.settings;
          this.officeHours = {
            startHour: settings.start_hour,
            endHour: settings.end_hour,
          };
          this.queryLimit = Number(settings.query_limit);
        },
        (error) => {
          console.error(error.body);
        }
      );
    },
    retrieveDoc(queryName) {
      try {
        let mdDoc = require("../doc-inline/" + this.$root.currentLocale + "/" +
            this.$route.meta.section + "_" + this.$route.meta.view + "_" + queryName + ".md");
        return mdDoc.default;
      } catch (error) {
        return null;
      }
    },
    retrieveQueryLimitMessage() {
      try {
        const userType = this.isAdmin ? "admin" : "user";
        let message = require("../doc-inline/" + this.$root.currentLocale + "/query_limit_hit_" + userType + ".md");
        this.queryLimitMessage = message.default;
      } catch (error) {
        this.queryLimitMessage = "";
      }
    }
  },
};
</script>

<style lang="scss" scoped>
.table-container {
  overflow-y: hidden;
  overflow-x: auto;
}

.export-container {
  position: relative;
  height: 12px;
}

.chart-caption {
  display: inline-block;
  margin-bottom: 1rem !important;
}

.ui.table.chart-details {
  margin: 0 auto;
}

.chart-doc-icon {
  color: #2185d0;
  margin-left: 0.3rem;
  margin-right: 0;
}

.chart-query-limit-icon {
  color: #f2711c;
  margin-left: 0.3rem;
}

.chart-doc, .chart-query-limit {
  text-align: left !important;
  max-width: 35rem !important;
  max-height: 14rem;
  overflow-y: auto;
}
</style>
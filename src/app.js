var datatable = {
  template: '<table class="table table-bordered table-striped" width="100%"><thead>' +
          '      <tr>' +
          '        <th v-for="column in allColumns">{{ column.title }}</th>' +
          '      </tr>' +
          '    </thead>' +
          '    <tbody></tbody>' +
          '  </table>',
  props: {
    columns: Array,
    items: [Array],
    prefixNodeId: {
      type: String,
      default: 'item',
    },
    propItemName: {
      type: String,
      default: 'item',
    },
    filters: {
      type: Object,
      default: () => {
        return {};
      }
    },
    ajax: {
      type: Object,
      default: () => {
        return null;
      }
    },
    rowReorder: {
      type: Boolean,
      default: false
    },
    reorderUrl: {
      type: String
    },
    vueObject: {
      type: Object,
      default: () => {
        return {};
      }
    },
  },
  data() {
    return {
      allColumns: [
        {
          title: 'ID',
          property: 'id',
          visible: false,
        },
        ...this.columns,
      ],

      itemIDs: this.items ? this.items.map(item => item.id) : [],
      datatable: null,
    }
  },
  mounted() {
    this.initializeTable();
  },
  watch: {
    'ajax.needRefresh' (needRefresh) {
      if (needRefresh) {
        this.datatable.ajax.reload();

        this.ajax.reset();
      }
    },
    'filters': {
      handler() {
        if (!this.ajax) return;

        this.datatable.ajax.reload();
      },
      deep: true
    },
    items(items) {
      // Find new items
      let newItems = items.filter(item => {
        return this.itemIDs.indexOf(item.id) == -1;
      });
      this.addRows(newItems);

      // Remove items from datatable
      let removedIds = this.itemIDs.filter(itemId => {
        return items.length === 0 || !items.find(item => item.id == itemId);
      });

      removedIds.forEach((removedId) => {
        this.deleteRow(removedId);
      });

      // Update itemIDs
      this.itemIDs = items.map(item => item.id);
    }
  },
  methods: {
    initializeTable() {
      this.datatable = $(this.$el).DataTable({
        responsive: true,
        ordering: this.rowReorder ? false : true,
        "pagingType": "simple_numbers",
        "pageLength": 50,
        "lengthMenu": [[10, 25, 50, 100], [10, 25, 50, 100]],
        ...( this.ajax ? {
          processing: true,
          serverSide: true,
          ajax: {
            "url": this.ajax.url,

            "data": (d) => {
              // Setup requested page
              d.page = (d.start / d.length) + 1;

              // Setup filters to request
              d = Object.assign(d, this.filters);
            },
          },
        } : {}),

        // Necessary only for server side processing
        ... (this.ajax ? {
          "columns": this.allColumns.map((column) => {
            let name = (column.hasOwnProperty('name')) ? column.name : column.title.toLowerCase().replace(' ', '_');

            return {
              name,
              data: 'id',// just stub that will be replaced by 'columnDefs'
            };
          })
        } : {}),

        "columnDefs": [
          ...this.allColumns
            .map((column, index) => {
              let columnDef = {
                targets: index,
                ...column
              };

              if (column.hasOwnProperty('component')) {
                columnDef.createdCell = (td, cellData, rowData, row, col) => {
                  let item = this.items ? this.items.find(item => item.id === rowData[0]) : rowData;

                  new Vue(
                    Object.assign(
                      this.vueObject,
                      column.component,
                      {
                        propsData: {
                          [this.propItemName]: item,
                          ...column.props
                        },
                      },
                    )
                  )
                    .$mount(td);
                };
              }

              return columnDef;
            })
            .filter(column => column.hasOwnProperty('targets')),

          ...( this.ajax ? this.allColumns
            .map((column, index) => {
              if (!column.hasOwnProperty('property')) return {};

              return {
                targets: index,
                "render": (data, type, row, meta) => {
                  let item = row;

                  if (typeof column.property === 'string') {
                    // By Property
                    let properties = column.property.split('.');

                    let endValue = item;

                    properties.forEach(property => {
                      endValue = endValue[property];
                    });

                    return endValue;
                  } else {
                    return column.property(item);
                  }
                },
                ...column
              };
            })
            .filter(column => column.hasOwnProperty('targets')) : {})
        ]
      });

      if (this.items) {
        this.addRows(this.items);
      }

      let self = this;

      if (this.rowReorder) {
        $(this.$el).find('tbody').sortable({
          stop: (event, ui) => {
            // if executing search then prevent changing ordering
            var searchValue = $('.dataTables_filter input').val();
            if(searchValue.trim()) {
              event.preventDefault();

              self.$emit('orderingChangePrevent');

              return;
            }

            let ids = [];
            $(this.$el).find('tbody tr').each(function () {
              let id = $(this).attr('id').replace('item_', '');

              ids.push(id);
            });

            $.ajax({
              type: "POST",
              url: this.reorderUrl,
              data: {
                ids: ids
              },
              success: function (response) {
                self.$emit('orderingChanged');
              },
              error: function (xhr, error, thrownError) {
                self.$emit('orderingChangeError', error);
              },
            });
          }
        });
      }
    },
    addRows(items) {
      items.forEach((item) => {
        this.addRow(item);
      });

      this.datatable.draw();
    },
    addRow(item) {
      let row = this.allColumns.map((column) => {
        if (column.hasOwnProperty('property')) {
          if (typeof column.property === 'string') {
            // By Property
            let properties = column.property.split('.');

            let endValue = item;

            properties.forEach(property => {
              endValue = endValue[property];
            });

            return endValue;
          } else {
            return column.property(item);
          }
        }

        // Component way
        if (column.hasOwnProperty('component')) {
          // return here nothing but on the initialization we implement this way
          return '';
        }
      });

      this.datatable.row.add(row).node().id = `${this.prefixNodeId}_${item.id}`;
    },
    deleteRow(itemId) {
      this.datatable.row($(this.$el).find(`tr#${this.prefixNodeId}_${itemId}`)).remove().draw();
    }
  }
};

new Vue({
  el: '#app',
  components: {
    datatable: datatable,
  },
  data: {
    itemsCount: 10,
    columns: [
      {
        title: 'Name',
        property: 'name',
        name: 'name',
      },
      {
        title: 'Email',
        property: 'email',
        name: 'email',
        orderable: false,
        searchable: false,
      },
      {
        title: 'Phone',
        property: 'phone',
        name: 'phone',
        property: function(item) {
          return item.number;
        },
      },
    ],
    items: [],
  },
  created() {
    this.fillDummyData();
  },
  methods: {
    fillDummyData() {
      for (var i = 0; i < this.itemsCount; i++) {
        this.items.push({
          name: 'name' + i,
          email: 'email@example' + i + '.com',
          phone: {
            number: '+1111' + i,
          }
        });
      }
    },
  },
});
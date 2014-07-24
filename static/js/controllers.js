(function () {

  'use strict';

  var inboxControllers = angular.module('inboxControllers', ['ngSanitize']);

  var getRelativeDate = function(moment, dateFormat) {
      return '<span title="' + moment.format(dateFormat) + '">' + 
        moment.fromNow() + 
        '</span>';
  };

  inboxControllers.filter('relativeDate', ['RememberService',
    function (RememberService) {
      return function (date) {
        if (!date) { 
          return ''; 
        }
        return getRelativeDate(moment(date), RememberService.dateFormat);
      };
    }
  ]);

  inboxControllers.filter('state', function () {
    return function (task) {
      if (!task || !task.state) {
        return '';
      }
      var title = task.due ? moment(task.due).fromNow() : '';
      return '<span class="task-state" title="' + title + '">' +
        task.state +
        '</span>';
    };
  });

  inboxControllers.filter('messageField', ['RememberService',
    function (RememberService) {
      return function (field) {
        if (!field) { 
          return ''; 
        }
        var label = field.label;
        var value = field.value;
        if (['Child Birth Date', 'Expected Date', 'Birth Date'].indexOf(label) !== -1) {
          value = getRelativeDate(moment(value), RememberService.dateFormat);
        }
        return '<label>' + label + '</label><p>' + value + '</p>';
      };
    }
  ]);

  inboxControllers.filter('messageType', function () {
    return function (message, forms) {
      if (!message || !forms) { 
        return '';
      }
      if (!message.form) {
        return 'Message';
      }
      for (var i = 0; i < forms.length; i++) {
        if (message.form === forms[i].code) {
          return forms[i].name;
        }
      }
      return message.form;
    };
  });

  inboxControllers.directive('scroller', ['$timeout', 'RememberService', 
    function($timeout, RememberService) {
      return {
        restrict: 'A',
        scope: {},
        link: function(scope, elm) {
          var raw = elm[0];
          
          elm.bind('scroll', function() {
            RememberService.scrollTop = raw.scrollTop;
          });

          $timeout(function() {
            raw.scrollTop = RememberService.scrollTop;
          });
        }
      };
    }
  ]);


  inboxControllers.directive('mmSender', function() {
    return {
      restrict: 'E',
      scope: { message: '=' },
      templateUrl: '/partials/sender.html'
    };
  });

  inboxControllers.controller('InboxCtrl', 
    ['$scope', '$route', '$location', '$translate', 'Facility', 'Settings', 'Form', 'Language', 'ReadMessages', 'UserNameService', 'RememberService',
    function ($scope, $route, $location, $translate, Facility, Settings, Form, Language, ReadMessages, UserNameService, RememberService) {

      $scope.forms = [];
      $scope.facilities = [];
      $scope.selected = undefined;
      $scope.loading = true;
      $scope.appending = false;
      $scope.messages = [];
      $scope.totalMessages = undefined;
      $scope.initialized = false;
      $scope.userDistrict = undefined;
      $scope.filterQuery = undefined;

      $scope.readStatus = {
        forms: { total: 0, read: 0 },
        messages: { total: 0, read: 0 }
      };

      $scope.filterModel = {
        type: 'messages',
        forms: [],
        facilities: [],
        valid: true,
        date: {
          from: moment().subtract('months', 1).valueOf(),
          to: moment().valueOf()
        }
      };

      Form.get().then(
        function(res) {
          $scope.forms = res;
        },
        function() {
          console.log('Failed to retrieve facilities');
        }
      );

      Settings.query(function(res) {
        if (res.settings && res.settings.reported_date_format) {
          RememberService.dateFormat = res.settings.reported_date_format;
        }
      });

      Language.get().then(
        function(language) {
          $translate.use(language);
        },
        function() {
          console.log('Failed to retrieve language');
        }
      );

      var updateAvailableFacilities = function() {
        Facility.get({
          userDistrict: $scope.userDistrict
        }).then(
          function(res) {
            $scope.facilities = res;
          },
          function() {
            console.log('Failed to retrieve facilities');
          }
        );
      };

      var updateReadStatus = function () {
        ReadMessages.get({
          user: UserNameService(),
          userDistrict: $scope.userDistrict
        }).then(
          function(res) {
            $scope.readStatus = res;
          },
          function() {
            console.log('Failed to retrieve read status');
          }
        );
      };

      $scope.setMessage = function(id) {
        $location.path('/' + $scope.filterModel.type + '/' + id);
      };

      $scope.selectMessage = function(id) {
        if ($scope.selected && $scope.selected._id === id) {
          return;
        }
        $scope.selected = undefined;
        _selectedDoc = id;
        if (id) {
          $scope.messages.forEach(function(message) {
            if (message._id === id) {
              if (!$scope.isRead(message)) {
                var type = message.form ? 'forms' : 'messages';
                $scope.readStatus[type].read++;
                $('body').trigger('markRead', {
                  read: true,
                  messageId: id,
                  username: UserNameService()
                });
              }
              $scope.selected = message;
            }
          });
        }
      };

      var _deleteMessage = function(id) {
        if ($scope.selected && $scope.selected._id === id) {
          $scope.selected = undefined;
        }
        for (var i = 0; i < $scope.messages.length; i++) {
          if (id === $scope.messages[i]._id) {
            $scope.messages.splice(i, 1);
          }
        }
      };

      var _findMessage = function(id) {
        for (var i = 0; i < $scope.messages.length; i++) {
          if (id === $scope.messages[i]._id) {
            return $scope.messages[i];
          }
        }
      };

      $scope.update = function(updated) {
        for (var i = 0; i < updated.length; i++) {
          var newMsg = updated[i];
          var oldMsg = _findMessage(newMsg._id);
          if (oldMsg) {
            if (newMsg._rev !== oldMsg._rev) {
              for (var prop in newMsg) {
                if (newMsg.hasOwnProperty(prop)) {
                  oldMsg[prop] = newMsg[prop];
                }
              }
            }
          } else {
            $scope.messages.push(newMsg);
          }
        }
        $scope.loading = false;
        $scope.appending = false;
      };

      $scope.isRead = function(message) {
        message.read = message.read || [];
        if ($scope.selected && $scope.selected._id === message._id) {
          return true;
        }
        for (var i = 0; i < message.read.length; i++) {
          if (message.read[i] === UserNameService()) {
            return true;
          }
        }
        return false;
      };

      var _setFilterString = function() {

        var formatDate = function(date) {
          return date.format('YYYY-MM-DD');
        };

        var filters = [];

        // increment end date so it's inclusive
        var to = moment($scope.filterModel.date.to).add('days', 1);
        var from = moment($scope.filterModel.date.from);

        filters.push(
          'reported_date<date>:[' + 
          formatDate(from) + ' TO ' + formatDate(to) + 
          ']'
        );

        if ($scope.filterModel.type === 'messages') {
          filters.push('-form:[* TO *]');
        } else {
          var selectedForms = $scope.filterModel.forms.length;
          if (selectedForms > 0 && selectedForms < $scope.forms.length) {
            var formCodes = [];
            $scope.filterModel.forms.forEach(function(form) {
              formCodes.push(form.code);
            });
            filters.push('form:(' + formCodes.join(' OR ') + ')');
          } else {
            filters.push('form:[* TO *]');
          }
        }

        if ($scope.filterModel.valid === true) {
          filters.push('errors<int>:0');
        } else if ($scope.filterModel.valid === false) {
          filters.push('NOT errors<int>:0');
        }

        var selectedFacilities = $scope.filterModel.facilities.length;
        if (selectedFacilities > 0 && selectedFacilities < $scope.facilities.length) {
          filters.push('clinic:(' + $scope.filterModel.facilities.join(' OR ') + ')');
        }

        $scope.filterQuery = filters.join(' AND ');
      };

      var _currentQuery;
      var _selectedDoc;

      $scope.advancedFilter = function(options) {
        if (!$scope.initialized) {
          return;
        }
        options = options || {};
        options.query = $scope.filterQuery;
        if (options.query === _currentQuery && !options.changes) {
          // debounce as same query already running
          return;
        }
        _currentQuery = options.query;
        if (options.changes) {
          var changedRows = options.changes.results;
          for (var i = 0; i < changedRows.length; i++) {
            if (changedRows[i].deleted) {
              _deleteMessage(changedRows[i].id);
            }
          }
        }
        if (!options.silent) {
          $scope.loading = true;
        }
        if (options.skip) {
          $scope.appending = true;
          options.skip = $scope.messages.length;
        } else if (!options.silent) {
          $scope.messages = [];
        }
        options.callback = function(err, data) {
          _currentQuery = null;
          if (err) {
            return console.log(err);
          }
          angular.element($('body')).scope().$apply(function(scope) {
            updateReadStatus();
            scope.update(data.rows);
            scope.totalMessages = data.total_rows;
            if (_selectedDoc) {
              scope.selectMessage(_selectedDoc);
            }
          });
        };
        $('body').trigger('updateMessages', options);
      };

      $scope.filter = function(options) {
        _setFilterString();
        $scope.advancedFilter(options);
      };

      $scope.$watch('filterModel', $scope.filter, true);
      $scope.$watch('filterModel.type', function() { 
        $scope.selected = undefined; 
      });

      $scope.init = function(options) {
        $scope.initialized = true;
        $scope.userDistrict = options.district;
        $scope.filter();
        updateAvailableFacilities();
      };
    }
  ]);

  inboxControllers.controller('MessageCtrl', 
    ['$scope', '$route', 
    function ($scope, $route) {
      $scope.filterModel.type = 'messages';
      $scope.selectMessage($route.current.params.doc);
    }
  ]);


  inboxControllers.controller('FormCtrl', 
    ['$scope', '$route', 
    function ($scope, $route) {
      $scope.filterModel.type = 'forms';
      $scope.selectMessage($route.current.params.doc);
    }
  ]);


  inboxControllers.controller('ReportCtrl', 
    ['$scope', 
    function ($scope) {
      $scope.filterModel.type = 'reports';
      $scope.selectMessage();
      $('body').trigger('renderReports');
    }
  ]);

}());
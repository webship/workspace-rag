Feature: The RAG workspace plugin
  Once the plugin is activated and installed, the rag workspace is on the dashboard, and the
  Plugins page lists the plugin with its four steps.

  Scenario: The workspace page is there
    Given I am on "/rag"
     Then I should see "RAG"

  Scenario: The plugin is listed on the Plugins page
    Given I am on "/settings/plugins"
     Then I should see "RAG"
      And I should see "@webship/workspace-rag"

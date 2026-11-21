Feature: The RAG workspace plugin
  Once the plugin is activated and installed, the rag workspace is on the dashboard, and the
  Plugins page lists the plugin with its four steps.

  Scenario: The workspace page is there
    Given I am on "/rag"
     Then the element "h1" should be displayed
      And "#webship-workspace-projects, .items-list, .workspace-page" should be attached

  # The Plugins page names each plugin; the package is on the plugin's own page (the row shows it on hover only).
  Scenario: The plugin is listed on the Plugins page, and its own page names its package
    Given I am on "/settings/plugins"
     Then I should see "RAG"
     When I go to "/settings/plugin/rag"
     Then I should see "@webship.co/workspace-rag"

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents?q=rag-index-keeper"
     Then I should see "rag-index-keeper"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=rag-workflow"
     Then I should see "rag-workflow"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=rag-search"
     Then I should see "rag-search"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts?q=rag-start-and-search"
     Then I should see "rag-start-and-search"

  # The RAG menu of a project row, on every row of a folder the index builder (cmd-tools-ragify.sh) is in.
  # Its state is the caption beside the button, which a screen reader reads, and the button's name says it too.
  @needs-project-dev
  Scenario: A project row carries the RAG menu, with the state of its index
    Given I am on "/dev"
     Then ".project-row .act-menu-rag button" should be attached
      And ".project-row .act-menu-rag + .act-status" should be attached
      And ".project-row .act-menu-rag button[aria-label^='RAG index: ']" should be attached

  # Opened with the keyboard, the menu offers to build the index and the way to the RAG workspace, whatever the
  # state of the server; Escape closes it and gives the focus back to its button.
  @needs-project-dev
  Scenario: The RAG menu opens from the keyboard, offers to build the index and the RAG workspace, and closes on Escape
    Given I am on "/dev"
     When I focus on the element ".project-row >> nth=0 >> .act-menu-rag button"
      And I press the key "Enter"
     Then ".act-menu-rag .uk-dropdown.uk-open" should be visible
      And ".act-menu-rag .uk-dropdown.uk-open [data-entry='build the index'] a" should be visible within 10 seconds
      And ".act-menu-rag .uk-dropdown.uk-open [data-entry='open the rag workspace'] a" should be visible
     When I wait 1 second
      And I press the key "Tab"
      And I press the key "Escape"
      And I wait 1 second
     Then ".act-menu-rag .uk-dropdown.uk-open" should not be visible
      And the focused element should match ".act-menu-rag button"

  # The rows of the rag folder are its servers, not projects to index.
  @needs-project-rag
  Scenario: The servers of the RAG workspace carry no RAG menu
    Given I am on "/rag"
     Then ".project-row" should be attached
      And ".project-row .act-menu-rag" should not be attached

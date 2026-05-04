/* eslint-disable */
import * as types from "./graphql";
import { TypedDocumentNode as DocumentNode } from "@graphql-typed-document-node/core";

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  "\n  query AgentIdentityDebug($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n": typeof types.AgentIdentityDebugDocument;
  "\n  mutation UpdateAgentSettingsDebug($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n": typeof types.UpdateAgentSettingsDebugDocument;
  "\n  query AgentCostSummary($organizationId: ID!, $startDate: String!, $endDate: String!) {\n    agentCostSummary(organizationId: $organizationId, startDate: $startDate, endDate: $endDate) {\n      budget {\n        dailyLimitCents\n        spentCents\n        remainingCents\n        remainingPercent\n      }\n      dailyCosts {\n        date\n        totalCostCents\n        tier2Calls\n        tier2CostCents\n        tier3Calls\n        tier3CostCents\n        summaryCalls\n        summaryCostCents\n      }\n    }\n  }\n": typeof types.AgentCostSummaryDocument;
  "\n  query AgentExecutionLogDetail($organizationId: ID!, $id: ID!) {\n    agentExecutionLog(organizationId: $organizationId, id: $id) {\n      id\n      organizationId\n      triggerEventId\n      batchSize\n      agentId\n      modelTier\n      model\n      promoted\n      promotionReason\n      inputTokens\n      outputTokens\n      estimatedCostCents\n      contextTokenAllocation\n      disposition\n      confidence\n      plannedActions\n      policyDecision\n      finalActions\n      status\n      inboxItemId\n      latencyMs\n      createdAt\n      llmCalls {\n        id\n        executionLogId\n        turnNumber\n        model\n        provider\n        systemPrompt\n        messages\n        tools\n        maxTokens\n        temperature\n        responseContent\n        stopReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        latencyMs\n        createdAt\n      }\n    }\n  }\n": typeof types.AgentExecutionLogDetailDocument;
  "\n  query AgentExecutionLogs($organizationId: ID!, $filters: ExecutionLogFilters) {\n    agentExecutionLogs(organizationId: $organizationId, filters: $filters) {\n      items {\n        id\n        triggerEventId\n        batchSize\n        agentId\n        modelTier\n        model\n        promoted\n        promotionReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        disposition\n        confidence\n        status\n        latencyMs\n        createdAt\n      }\n      totalCount\n    }\n  }\n": typeof types.AgentExecutionLogsDocument;
  "\n  query AgentWorkerStatus($organizationId: ID!) {\n    agentWorkerStatus(organizationId: $organizationId) {\n      running\n      uptime\n      openAggregationWindows\n      activeOrganizations\n    }\n    agentAggregationWindows(organizationId: $organizationId) {\n      scopeKey\n      eventCount\n      openedAt\n      lastEventAt\n    }\n  }\n": typeof types.AgentWorkerStatusDocument;
  "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": typeof types.SendChannelMessageDocument;
  "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      slug\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupsDocument;
  "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.FilteredSessionGroupsDocument;
  "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n": typeof types.AddChatMemberDocument;
  "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n": typeof types.SendChatMessageDocument;
  "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n": typeof types.RenameChatDocument;
  "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ThreadRepliesDocument;
  "\n  query NewProjectRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.NewProjectReposDocument;
  "\n  mutation CreateProjectFromGoal($input: CreateProjectFromGoalInput!) {\n    createProjectFromGoal(input: $input) {\n      id\n      name\n      organizationId\n      repoId\n      runs {\n        id\n        projectId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.CreateProjectFromGoalDocument;
  "\n  query Project($id: ID!) {\n    project(id: $id) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n        name\n      }\n      sessions {\n        id\n        name\n      }\n      tickets {\n        id\n        title\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.ProjectDocument;
  "\n  query Projects($organizationId: ID!) {\n    projects(organizationId: $organizationId) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n      }\n      sessions {\n        id\n      }\n      tickets {\n        id\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.ProjectsDocument;
  "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n": typeof types.SessionGroupBranchDiffDocument;
  "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n": typeof types.SessionGroupFilesDocument;
  "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n": typeof types.SessionGroupFileAtRefDocument;
  "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.SessionGroupFileContentForDiffDocument;
  "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.SessionGroupFileContentDocument;
  "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SessionDetailDocument;
  "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      slug\n      status\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupDetailDocument;
  "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": typeof types.AgentIdentityDocument;
  "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": typeof types.UpdateAgentSettingsDocument;
  "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.MyApiTokensDocument;
  "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.SetApiTokenDocument;
  "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n": typeof types.DeleteApiTokenDocument;
  "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateRepoDocument;
  "\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n": typeof types.AddOrgMemberDocument;
  "\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n": typeof types.RemoveOrgMemberDocument;
  "\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n": typeof types.UpdateOrgMemberRoleDocument;
  "\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n": typeof types.SearchUsersDocument;
  "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.SettingsReposDocument;
  "\n  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {\n    agentEnvironments(orgId: $orgId) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n    myConnections {\n      bridge {\n        id\n        instanceId\n        label\n        hostingMode\n        connected\n      }\n      repos {\n        repo {\n          id\n          name\n        }\n      }\n    }\n  }\n": typeof types.AgentEnvironmentsSettingsDocument;
  "\n  query OrgSecrets($orgId: ID!) {\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.OrgSecretsDocument;
  "\n  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {\n    createAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.CreateAgentEnvironmentDocument;
  "\n  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {\n    updateAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.UpdateAgentEnvironmentDocument;
  "\n  mutation DeleteAgentEnvironment($id: ID!) {\n    deleteAgentEnvironment(id: $id)\n  }\n": typeof types.DeleteAgentEnvironmentDocument;
  "\n  mutation TestAgentEnvironment($id: ID!) {\n    testAgentEnvironment(id: $id) {\n      ok\n      message\n    }\n  }\n": typeof types.TestAgentEnvironmentDocument;
  "\n  mutation SetOrgSecret($input: SetOrgSecretInput!) {\n    setOrgSecret(input: $input) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SetOrgSecretDocument;
  "\n  mutation DeleteOrgSecret($orgId: ID!, $id: ID!) {\n    deleteOrgSecret(orgId: $orgId, id: $id)\n  }\n": typeof types.DeleteOrgSecretDocument;
  "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateDmDocument;
  "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n": typeof types.AllChannelsDocument;
  "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n": typeof types.JoinChannelDocument;
  "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n": typeof types.LeaveChannelDocument;
  "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateChannelGroupCollapseDocument;
  "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChannelDocument;
  "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChannelGroupDocument;
  "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChatDocument;
  "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n": typeof types.DeleteChannelGroupDocument;
  "\n  query Tickets($organizationId: ID!) {\n    tickets(organizationId: $organizationId) {\n      id\n      title\n      description\n      status\n      priority\n      assignees {\n        id\n        name\n        avatarUrl\n      }\n      labels\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.TicketsDocument;
  "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) {\n      id\n    }\n  }\n": typeof types.MoveChannelDocument;
  "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateChannelGroupPositionDocument;
  "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) {\n      id\n    }\n  }\n": typeof types.ReorderChannelsDocument;
  "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ChannelMessagesDocument;
  "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.ChannelEventsForMessagesDocument;
  "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ChatMessagesDocument;
  "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.ChatEventsSubscriptionDocument;
  "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.OrgEventsDocument;
  "\n  query ProjectEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.ProjectEventsDocument;
  "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $before: DateTime\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      before: $before\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsDocument;
  "\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsLiveDocument;
  "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      repo {\n        id\n        name\n      }\n    }\n  }\n": typeof types.ChannelsDocument;
  "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n": typeof types.ChannelGroupsDocument;
  "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.ReposDocument;
  "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.ChatsDocument;
  "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n": typeof types.InboxItemsDocument;
  "\n  query OnboardingRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.OnboardingReposDocument;
  "\n  query OnboardingSessions($organizationId: ID!) {\n    sessions(organizationId: $organizationId) {\n      id\n    }\n  }\n": typeof types.OnboardingSessionsDocument;
};
const documents: Documents = {
  "\n  query AgentIdentityDebug($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n":
    types.AgentIdentityDebugDocument,
  "\n  mutation UpdateAgentSettingsDebug($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n":
    types.UpdateAgentSettingsDebugDocument,
  "\n  query AgentCostSummary($organizationId: ID!, $startDate: String!, $endDate: String!) {\n    agentCostSummary(organizationId: $organizationId, startDate: $startDate, endDate: $endDate) {\n      budget {\n        dailyLimitCents\n        spentCents\n        remainingCents\n        remainingPercent\n      }\n      dailyCosts {\n        date\n        totalCostCents\n        tier2Calls\n        tier2CostCents\n        tier3Calls\n        tier3CostCents\n        summaryCalls\n        summaryCostCents\n      }\n    }\n  }\n":
    types.AgentCostSummaryDocument,
  "\n  query AgentExecutionLogDetail($organizationId: ID!, $id: ID!) {\n    agentExecutionLog(organizationId: $organizationId, id: $id) {\n      id\n      organizationId\n      triggerEventId\n      batchSize\n      agentId\n      modelTier\n      model\n      promoted\n      promotionReason\n      inputTokens\n      outputTokens\n      estimatedCostCents\n      contextTokenAllocation\n      disposition\n      confidence\n      plannedActions\n      policyDecision\n      finalActions\n      status\n      inboxItemId\n      latencyMs\n      createdAt\n      llmCalls {\n        id\n        executionLogId\n        turnNumber\n        model\n        provider\n        systemPrompt\n        messages\n        tools\n        maxTokens\n        temperature\n        responseContent\n        stopReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        latencyMs\n        createdAt\n      }\n    }\n  }\n":
    types.AgentExecutionLogDetailDocument,
  "\n  query AgentExecutionLogs($organizationId: ID!, $filters: ExecutionLogFilters) {\n    agentExecutionLogs(organizationId: $organizationId, filters: $filters) {\n      items {\n        id\n        triggerEventId\n        batchSize\n        agentId\n        modelTier\n        model\n        promoted\n        promotionReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        disposition\n        confidence\n        status\n        latencyMs\n        createdAt\n      }\n      totalCount\n    }\n  }\n":
    types.AgentExecutionLogsDocument,
  "\n  query AgentWorkerStatus($organizationId: ID!) {\n    agentWorkerStatus(organizationId: $organizationId) {\n      running\n      uptime\n      openAggregationWindows\n      activeOrganizations\n    }\n    agentAggregationWindows(organizationId: $organizationId) {\n      scopeKey\n      eventCount\n      openedAt\n      lastEventAt\n    }\n  }\n":
    types.AgentWorkerStatusDocument,
  "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n":
    types.SendChannelMessageDocument,
  "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      slug\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.SessionGroupsDocument,
  "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.FilteredSessionGroupsDocument,
  "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n":
    types.AddChatMemberDocument,
  "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n":
    types.SendChatMessageDocument,
  "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n":
    types.RenameChatDocument,
  "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n":
    types.ThreadRepliesDocument,
  "\n  query NewProjectRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n":
    types.NewProjectReposDocument,
  "\n  mutation CreateProjectFromGoal($input: CreateProjectFromGoalInput!) {\n    createProjectFromGoal(input: $input) {\n      id\n      name\n      organizationId\n      repoId\n      runs {\n        id\n        projectId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.CreateProjectFromGoalDocument,
  "\n  query Project($id: ID!) {\n    project(id: $id) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n        name\n      }\n      sessions {\n        id\n        name\n      }\n      tickets {\n        id\n        title\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.ProjectDocument,
  "\n  query Projects($organizationId: ID!) {\n    projects(organizationId: $organizationId) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n      }\n      sessions {\n        id\n      }\n      tickets {\n        id\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.ProjectsDocument,
  "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n":
    types.SessionGroupBranchDiffDocument,
  "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n":
    types.SessionGroupFilesDocument,
  "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n":
    types.SessionGroupFileAtRefDocument,
  "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n":
    types.SessionGroupFileContentForDiffDocument,
  "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n":
    types.SessionGroupFileContentDocument,
  "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.SessionDetailDocument,
  "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      slug\n      status\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.SessionGroupDetailDocument,
  "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n":
    types.AgentIdentityDocument,
  "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n":
    types.UpdateAgentSettingsDocument,
  "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n":
    types.MyApiTokensDocument,
  "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n":
    types.SetApiTokenDocument,
  "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n":
    types.DeleteApiTokenDocument,
  "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n":
    types.CreateRepoDocument,
  "\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n":
    types.AddOrgMemberDocument,
  "\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n":
    types.RemoveOrgMemberDocument,
  "\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n":
    types.UpdateOrgMemberRoleDocument,
  "\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n":
    types.SearchUsersDocument,
  "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n":
    types.SettingsReposDocument,
  "\n  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {\n    agentEnvironments(orgId: $orgId) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n    myConnections {\n      bridge {\n        id\n        instanceId\n        label\n        hostingMode\n        connected\n      }\n      repos {\n        repo {\n          id\n          name\n        }\n      }\n    }\n  }\n":
    types.AgentEnvironmentsSettingsDocument,
  "\n  query OrgSecrets($orgId: ID!) {\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.OrgSecretsDocument,
  "\n  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {\n    createAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.CreateAgentEnvironmentDocument,
  "\n  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {\n    updateAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.UpdateAgentEnvironmentDocument,
  "\n  mutation DeleteAgentEnvironment($id: ID!) {\n    deleteAgentEnvironment(id: $id)\n  }\n":
    types.DeleteAgentEnvironmentDocument,
  "\n  mutation TestAgentEnvironment($id: ID!) {\n    testAgentEnvironment(id: $id) {\n      ok\n      message\n    }\n  }\n":
    types.TestAgentEnvironmentDocument,
  "\n  mutation SetOrgSecret($input: SetOrgSecretInput!) {\n    setOrgSecret(input: $input) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.SetOrgSecretDocument,
  "\n  mutation DeleteOrgSecret($orgId: ID!, $id: ID!) {\n    deleteOrgSecret(orgId: $orgId, id: $id)\n  }\n":
    types.DeleteOrgSecretDocument,
  "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n":
    types.CreateDmDocument,
  "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n":
    types.AllChannelsDocument,
  "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n":
    types.JoinChannelDocument,
  "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n":
    types.LeaveChannelDocument,
  "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n":
    types.UpdateChannelGroupCollapseDocument,
  "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n":
    types.CreateChannelDocument,
  "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n":
    types.CreateChannelGroupDocument,
  "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n":
    types.CreateChatDocument,
  "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n":
    types.DeleteChannelGroupDocument,
  "\n  query Tickets($organizationId: ID!) {\n    tickets(organizationId: $organizationId) {\n      id\n      title\n      description\n      status\n      priority\n      assignees {\n        id\n        name\n        avatarUrl\n      }\n      labels\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.TicketsDocument,
  "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) {\n      id\n    }\n  }\n":
    types.MoveChannelDocument,
  "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n":
    types.UpdateChannelGroupPositionDocument,
  "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) {\n      id\n    }\n  }\n":
    types.ReorderChannelsDocument,
  "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n":
    types.ChannelMessagesDocument,
  "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.ChannelEventsForMessagesDocument,
  "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n":
    types.ChatMessagesDocument,
  "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.ChatEventsSubscriptionDocument,
  "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.OrgEventsDocument,
  "\n  query ProjectEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.ProjectEventsDocument,
  "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $before: DateTime\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      before: $before\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.SessionEventsDocument,
  "\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.SessionEventsLiveDocument,
  "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      repo {\n        id\n        name\n      }\n    }\n  }\n":
    types.ChannelsDocument,
  "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n":
    types.ChannelGroupsDocument,
  "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n":
    types.ReposDocument,
  "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.ChatsDocument,
  "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n":
    types.InboxItemsDocument,
  "\n  query OnboardingRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n":
    types.OnboardingReposDocument,
  "\n  query OnboardingSessions($organizationId: ID!) {\n    sessions(organizationId: $organizationId) {\n      id\n    }\n  }\n":
    types.OnboardingSessionsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentIdentityDebug($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AgentIdentityDebug($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateAgentSettingsDebug($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateAgentSettingsDebug($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n      costBudget {\n        dailyLimitCents\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentCostSummary($organizationId: ID!, $startDate: String!, $endDate: String!) {\n    agentCostSummary(organizationId: $organizationId, startDate: $startDate, endDate: $endDate) {\n      budget {\n        dailyLimitCents\n        spentCents\n        remainingCents\n        remainingPercent\n      }\n      dailyCosts {\n        date\n        totalCostCents\n        tier2Calls\n        tier2CostCents\n        tier3Calls\n        tier3CostCents\n        summaryCalls\n        summaryCostCents\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AgentCostSummary($organizationId: ID!, $startDate: String!, $endDate: String!) {\n    agentCostSummary(organizationId: $organizationId, startDate: $startDate, endDate: $endDate) {\n      budget {\n        dailyLimitCents\n        spentCents\n        remainingCents\n        remainingPercent\n      }\n      dailyCosts {\n        date\n        totalCostCents\n        tier2Calls\n        tier2CostCents\n        tier3Calls\n        tier3CostCents\n        summaryCalls\n        summaryCostCents\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentExecutionLogDetail($organizationId: ID!, $id: ID!) {\n    agentExecutionLog(organizationId: $organizationId, id: $id) {\n      id\n      organizationId\n      triggerEventId\n      batchSize\n      agentId\n      modelTier\n      model\n      promoted\n      promotionReason\n      inputTokens\n      outputTokens\n      estimatedCostCents\n      contextTokenAllocation\n      disposition\n      confidence\n      plannedActions\n      policyDecision\n      finalActions\n      status\n      inboxItemId\n      latencyMs\n      createdAt\n      llmCalls {\n        id\n        executionLogId\n        turnNumber\n        model\n        provider\n        systemPrompt\n        messages\n        tools\n        maxTokens\n        temperature\n        responseContent\n        stopReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        latencyMs\n        createdAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AgentExecutionLogDetail($organizationId: ID!, $id: ID!) {\n    agentExecutionLog(organizationId: $organizationId, id: $id) {\n      id\n      organizationId\n      triggerEventId\n      batchSize\n      agentId\n      modelTier\n      model\n      promoted\n      promotionReason\n      inputTokens\n      outputTokens\n      estimatedCostCents\n      contextTokenAllocation\n      disposition\n      confidence\n      plannedActions\n      policyDecision\n      finalActions\n      status\n      inboxItemId\n      latencyMs\n      createdAt\n      llmCalls {\n        id\n        executionLogId\n        turnNumber\n        model\n        provider\n        systemPrompt\n        messages\n        tools\n        maxTokens\n        temperature\n        responseContent\n        stopReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        latencyMs\n        createdAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentExecutionLogs($organizationId: ID!, $filters: ExecutionLogFilters) {\n    agentExecutionLogs(organizationId: $organizationId, filters: $filters) {\n      items {\n        id\n        triggerEventId\n        batchSize\n        agentId\n        modelTier\n        model\n        promoted\n        promotionReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        disposition\n        confidence\n        status\n        latencyMs\n        createdAt\n      }\n      totalCount\n    }\n  }\n",
): (typeof documents)["\n  query AgentExecutionLogs($organizationId: ID!, $filters: ExecutionLogFilters) {\n    agentExecutionLogs(organizationId: $organizationId, filters: $filters) {\n      items {\n        id\n        triggerEventId\n        batchSize\n        agentId\n        modelTier\n        model\n        promoted\n        promotionReason\n        inputTokens\n        outputTokens\n        estimatedCostCents\n        disposition\n        confidence\n        status\n        latencyMs\n        createdAt\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentWorkerStatus($organizationId: ID!) {\n    agentWorkerStatus(organizationId: $organizationId) {\n      running\n      uptime\n      openAggregationWindows\n      activeOrganizations\n    }\n    agentAggregationWindows(organizationId: $organizationId) {\n      scopeKey\n      eventCount\n      openedAt\n      lastEventAt\n    }\n  }\n",
): (typeof documents)["\n  query AgentWorkerStatus($organizationId: ID!) {\n    agentWorkerStatus(organizationId: $organizationId) {\n      running\n      uptime\n      openAggregationWindows\n      activeOrganizations\n    }\n    agentAggregationWindows(organizationId: $organizationId) {\n      scopeKey\n      eventCount\n      openedAt\n      lastEventAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      slug\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      slug\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastMessageAt\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n",
): (typeof documents)["\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n",
): (typeof documents)["\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query NewProjectRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n",
): (typeof documents)["\n  query NewProjectRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateProjectFromGoal($input: CreateProjectFromGoalInput!) {\n    createProjectFromGoal(input: $input) {\n      id\n      name\n      organizationId\n      repoId\n      runs {\n        id\n        projectId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateProjectFromGoal($input: CreateProjectFromGoalInput!) {\n    createProjectFromGoal(input: $input) {\n      id\n      name\n      organizationId\n      repoId\n      runs {\n        id\n        projectId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Project($id: ID!) {\n    project(id: $id) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n        name\n      }\n      sessions {\n        id\n        name\n      }\n      tickets {\n        id\n        title\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query Project($id: ID!) {\n    project(id: $id) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n        name\n      }\n      sessions {\n        id\n        name\n      }\n      tickets {\n        id\n        title\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Projects($organizationId: ID!) {\n    projects(organizationId: $organizationId) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n      }\n      sessions {\n        id\n      }\n      tickets {\n        id\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query Projects($organizationId: ID!) {\n    projects(organizationId: $organizationId) {\n      id\n      name\n      organizationId\n      repoId\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n        webhookActive\n      }\n      aiMode\n      soulFile\n      members {\n        user {\n          id\n          email\n          name\n          avatarUrl\n        }\n        role\n        joinedAt\n        leftAt\n      }\n      channels {\n        id\n      }\n      sessions {\n        id\n      }\n      tickets {\n        id\n      }\n      runs {\n        id\n        organizationId\n        projectId\n        status\n        initialGoal\n        planSummary\n        activeGateId\n        latestControllerSummaryId\n        latestControllerSummaryText\n        executionConfig\n        createdAt\n        updatedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n",
): (typeof documents)["\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n",
): (typeof documents)["\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n",
): (typeof documents)["\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n",
): (typeof documents)["\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      slug\n      status\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      slug\n      status\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n",
): (typeof documents)["\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n",
): (typeof documents)["\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n",
): (typeof documents)["\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n",
): (typeof documents)["\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n",
): (typeof documents)["\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {\n    agentEnvironments(orgId: $orgId) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n    myConnections {\n      bridge {\n        id\n        instanceId\n        label\n        hostingMode\n        connected\n      }\n      repos {\n        repo {\n          id\n          name\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {\n    agentEnvironments(orgId: $orgId) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n    myConnections {\n      bridge {\n        id\n        instanceId\n        label\n        hostingMode\n        connected\n      }\n      repos {\n        repo {\n          id\n          name\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query OrgSecrets($orgId: ID!) {\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query OrgSecrets($orgId: ID!) {\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {\n    createAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {\n    createAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {\n    updateAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {\n    updateAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation DeleteAgentEnvironment($id: ID!) {\n    deleteAgentEnvironment(id: $id)\n  }\n",
): (typeof documents)["\n  mutation DeleteAgentEnvironment($id: ID!) {\n    deleteAgentEnvironment(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation TestAgentEnvironment($id: ID!) {\n    testAgentEnvironment(id: $id) {\n      ok\n      message\n    }\n  }\n",
): (typeof documents)["\n  mutation TestAgentEnvironment($id: ID!) {\n    testAgentEnvironment(id: $id) {\n      ok\n      message\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation SetOrgSecret($input: SetOrgSecretInput!) {\n    setOrgSecret(input: $input) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  mutation SetOrgSecret($input: SetOrgSecretInput!) {\n    setOrgSecret(input: $input) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation DeleteOrgSecret($orgId: ID!, $id: ID!) {\n    deleteOrgSecret(orgId: $orgId, id: $id)\n  }\n",
): (typeof documents)["\n  mutation DeleteOrgSecret($orgId: ID!, $id: ID!) {\n    deleteOrgSecret(orgId: $orgId, id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n",
): (typeof documents)["\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Tickets($organizationId: ID!) {\n    tickets(organizationId: $organizationId) {\n      id\n      title\n      description\n      status\n      priority\n      assignees {\n        id\n        name\n        avatarUrl\n      }\n      labels\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query Tickets($organizationId: ID!) {\n    tickets(organizationId: $organizationId) {\n      id\n      title\n      description\n      status\n      priority\n      assignees {\n        id\n        name\n        avatarUrl\n      }\n      labels\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n",
): (typeof documents)["\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n",
): (typeof documents)["\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ProjectEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  query ProjectEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $before: DateTime\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      before: $before\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $before: DateTime\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      before: $before\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      repo {\n        id\n        name\n      }\n    }\n  }\n",
): (typeof documents)["\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      repo {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n",
): (typeof documents)["\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n",
): (typeof documents)["\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n",
): (typeof documents)["\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query OnboardingRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n",
): (typeof documents)["\n  query OnboardingRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query OnboardingSessions($organizationId: ID!) {\n    sessions(organizationId: $organizationId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  query OnboardingSessions($organizationId: ID!) {\n    sessions(organizationId: $organizationId) {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;

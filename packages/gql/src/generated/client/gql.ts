/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

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
    "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": typeof types.SendChannelMessageDocument,
    "\n  query SessionGroups($channelId: ID!) {\n    sessionGroups(channelId: $channelId) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupsDocument,
    "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n": typeof types.AddChatMemberDocument,
    "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {\n    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": typeof types.SendChatMessageDocument,
    "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n": typeof types.RenameChatDocument,
    "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ThreadRepliesDocument,
    "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n": typeof types.SessionGroupBranchDiffDocument,
    "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n": typeof types.SessionGroupFilesDocument,
    "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n": typeof types.SessionGroupFileAtRefDocument,
    "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.SessionGroupFileContentForDiffDocument,
    "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.SessionGroupFileContentDocument,
    "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdAt\n        updatedAt\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SessionDetailDocument,
    "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      status\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupDetailDocument,
    "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n": typeof types.UpdateSessionConfigDocument,
    "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": typeof types.AgentIdentityDocument,
    "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": typeof types.UpdateAgentSettingsDocument,
    "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.MyApiTokensDocument,
    "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.SetApiTokenDocument,
    "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n": typeof types.DeleteApiTokenDocument,
    "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateRepoDocument,
    "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.SettingsReposDocument,
    "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateDmDocument,
    "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n": typeof types.AllChannelsDocument,
    "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n": typeof types.JoinChannelDocument,
    "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n": typeof types.LeaveChannelDocument,
    "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateChannelGroupCollapseDocument,
    "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChannelDocument,
    "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChannelGroupDocument,
    "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateChatDocument,
    "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n": typeof types.DeleteChannelGroupDocument,
    "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) { id }\n  }\n": typeof types.MoveChannelDocument,
    "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) { id }\n  }\n": typeof types.UpdateChannelGroupPositionDocument,
    "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) { id }\n  }\n": typeof types.ReorderChannelsDocument,
    "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ChannelMessagesDocument,
    "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.ChannelEventsForMessagesDocument,
    "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ChatMessagesDocument,
    "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.ChatEventsSubscriptionDocument,
    "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.OrgEventsDocument,
    "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsDocument,
    "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      repo { id name }\n    }\n  }\n": typeof types.ChannelsDocument,
    "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n": typeof types.ChannelGroupsDocument,
    "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.ReposDocument,
    "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.ChatsDocument,
    "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n": typeof types.InboxItemsDocument,
    "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n      sessionGroupId\n    }\n  }\n": typeof types.StartSessionDocument,
    "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": typeof types.RunSessionDocument,
    "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": typeof types.SendSessionMessageDocument,
    "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n": typeof types.TerminateSessionDocument,
    "\n  mutation DismissSession($id: ID!) {\n    dismissSession(id: $id) {\n      id\n    }\n  }\n": typeof types.DismissSessionDocument,
    "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n": typeof types.RetrySessionConnectionDocument,
    "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n": typeof types.MoveSessionToRuntimeDocument,
    "\n  mutation MoveSessionToCloud($sessionId: ID!) {\n    moveSessionToCloud(sessionId: $sessionId) {\n      id\n    }\n  }\n": typeof types.MoveSessionToCloudDocument,
    "\n  mutation DeleteSession($id: ID!) {\n    deleteSession(id: $id) {\n      id\n    }\n  }\n": typeof types.DeleteSessionDocument,
    "\n  mutation DeleteSessionGroup($id: ID!) {\n    deleteSessionGroup(id: $id)\n  }\n": typeof types.DeleteSessionGroupDocument,
    "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n": typeof types.AvailableSessionRuntimesDocument,
    "\n  mutation DismissInboxItem($id: ID!) {\n    dismissInboxItem(id: $id) {\n      id\n    }\n  }\n": typeof types.DismissInboxItemDocument,
    "\n  mutation AcceptAgentSuggestion($inboxItemId: ID!, $edits: JSON) {\n    acceptAgentSuggestion(inboxItemId: $inboxItemId, edits: $edits) {\n      id\n      status\n      resolvedAt\n    }\n  }\n": typeof types.AcceptAgentSuggestionDocument,
    "\n  mutation DismissAgentSuggestion($inboxItemId: ID!) {\n    dismissAgentSuggestion(inboxItemId: $inboxItemId) {\n      id\n      status\n      resolvedAt\n    }\n  }\n": typeof types.DismissAgentSuggestionDocument,
    "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n": typeof types.AvailableRuntimesDocument,
    "\n  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {\n    updateRepo(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateRepoDocument,
    "\n  mutation RegisterRepoWebhook($repoId: ID!) {\n    registerRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n": typeof types.RegisterRepoWebhookDocument,
    "\n  mutation UnregisterRepoWebhook($repoId: ID!) {\n    unregisterRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n": typeof types.UnregisterRepoWebhookDocument,
    "\n  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {\n    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)\n  }\n": typeof types.RepoBranchesDocument,
    "\n  query SessionTerminals($sessionId: ID!) {\n    sessionTerminals(sessionId: $sessionId) {\n      id\n      sessionId\n    }\n  }\n": typeof types.SessionTerminalsDocument,
    "\n  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {\n    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {\n      id\n      sessionId\n    }\n  }\n": typeof types.CreateTerminalDocument,
    "\n  mutation DestroyTerminal($terminalId: ID!) {\n    destroyTerminal(terminalId: $terminalId)\n  }\n": typeof types.DestroyTerminalDocument,
    "\n  query OrgMembers($id: ID!) {\n    organization(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n        role\n        joinedAt\n      }\n    }\n  }\n": typeof types.OrgMembersDocument,
    "\n  mutation EditChatMessage($messageId: ID!, $html: String!) {\n    editChatMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n": typeof types.EditChatMessageDocument,
    "\n  mutation DeleteChatMessage($messageId: ID!) {\n    deleteChatMessage(messageId: $messageId) {\n      id\n    }\n  }\n": typeof types.DeleteChatMessageDocument,
    "\n  mutation EditChannelMessage($messageId: ID!, $html: String!) {\n    editChannelMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n": typeof types.EditChannelMessageDocument,
    "\n  mutation DeleteChannelMessage($messageId: ID!) {\n    deleteChannelMessage(messageId: $messageId) {\n      id\n    }\n  }\n": typeof types.DeleteChannelMessageDocument,
};
const documents: Documents = {
    "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": types.SendChannelMessageDocument,
    "\n  query SessionGroups($channelId: ID!) {\n    sessionGroups(channelId: $channelId) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": types.SessionGroupsDocument,
    "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n": types.AddChatMemberDocument,
    "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {\n    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": types.SendChatMessageDocument,
    "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n": types.RenameChatDocument,
    "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": types.ThreadRepliesDocument,
    "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n": types.SessionGroupBranchDiffDocument,
    "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n": types.SessionGroupFilesDocument,
    "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n": types.SessionGroupFileAtRefDocument,
    "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": types.SessionGroupFileContentForDiffDocument,
    "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": types.SessionGroupFileContentDocument,
    "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdAt\n        updatedAt\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": types.SessionDetailDocument,
    "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      status\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": types.SessionGroupDetailDocument,
    "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n": types.UpdateSessionConfigDocument,
    "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": types.AgentIdentityDocument,
    "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n": types.UpdateAgentSettingsDocument,
    "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": types.MyApiTokensDocument,
    "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": types.SetApiTokenDocument,
    "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n": types.DeleteApiTokenDocument,
    "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": types.CreateRepoDocument,
    "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": types.SettingsReposDocument,
    "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": types.CreateDmDocument,
    "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n": types.AllChannelsDocument,
    "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n": types.JoinChannelDocument,
    "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n": types.LeaveChannelDocument,
    "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n": types.UpdateChannelGroupCollapseDocument,
    "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n": types.CreateChannelDocument,
    "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n": types.CreateChannelGroupDocument,
    "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": types.CreateChatDocument,
    "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n": types.DeleteChannelGroupDocument,
    "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) { id }\n  }\n": types.MoveChannelDocument,
    "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) { id }\n  }\n": types.UpdateChannelGroupPositionDocument,
    "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) { id }\n  }\n": types.ReorderChannelsDocument,
    "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": types.ChannelMessagesDocument,
    "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.ChannelEventsForMessagesDocument,
    "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": types.ChatMessagesDocument,
    "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.ChatEventsSubscriptionDocument,
    "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.OrgEventsDocument,
    "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": types.SessionEventsDocument,
    "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      repo { id name }\n    }\n  }\n": types.ChannelsDocument,
    "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n": types.ChannelGroupsDocument,
    "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": types.ReposDocument,
    "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": types.ChatsDocument,
    "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n": types.InboxItemsDocument,
    "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n      sessionGroupId\n    }\n  }\n": types.StartSessionDocument,
    "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": types.RunSessionDocument,
    "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n": types.SendSessionMessageDocument,
    "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n": types.TerminateSessionDocument,
    "\n  mutation DismissSession($id: ID!) {\n    dismissSession(id: $id) {\n      id\n    }\n  }\n": types.DismissSessionDocument,
    "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n": types.RetrySessionConnectionDocument,
    "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n": types.MoveSessionToRuntimeDocument,
    "\n  mutation MoveSessionToCloud($sessionId: ID!) {\n    moveSessionToCloud(sessionId: $sessionId) {\n      id\n    }\n  }\n": types.MoveSessionToCloudDocument,
    "\n  mutation DeleteSession($id: ID!) {\n    deleteSession(id: $id) {\n      id\n    }\n  }\n": types.DeleteSessionDocument,
    "\n  mutation DeleteSessionGroup($id: ID!) {\n    deleteSessionGroup(id: $id)\n  }\n": types.DeleteSessionGroupDocument,
    "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n": types.AvailableSessionRuntimesDocument,
    "\n  mutation DismissInboxItem($id: ID!) {\n    dismissInboxItem(id: $id) {\n      id\n    }\n  }\n": types.DismissInboxItemDocument,
    "\n  mutation AcceptAgentSuggestion($inboxItemId: ID!, $edits: JSON) {\n    acceptAgentSuggestion(inboxItemId: $inboxItemId, edits: $edits) {\n      id\n      status\n      resolvedAt\n    }\n  }\n": types.AcceptAgentSuggestionDocument,
    "\n  mutation DismissAgentSuggestion($inboxItemId: ID!) {\n    dismissAgentSuggestion(inboxItemId: $inboxItemId) {\n      id\n      status\n      resolvedAt\n    }\n  }\n": types.DismissAgentSuggestionDocument,
    "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n": types.AvailableRuntimesDocument,
    "\n  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {\n    updateRepo(id: $id, input: $input) {\n      id\n    }\n  }\n": types.UpdateRepoDocument,
    "\n  mutation RegisterRepoWebhook($repoId: ID!) {\n    registerRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n": types.RegisterRepoWebhookDocument,
    "\n  mutation UnregisterRepoWebhook($repoId: ID!) {\n    unregisterRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n": types.UnregisterRepoWebhookDocument,
    "\n  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {\n    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)\n  }\n": types.RepoBranchesDocument,
    "\n  query SessionTerminals($sessionId: ID!) {\n    sessionTerminals(sessionId: $sessionId) {\n      id\n      sessionId\n    }\n  }\n": types.SessionTerminalsDocument,
    "\n  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {\n    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {\n      id\n      sessionId\n    }\n  }\n": types.CreateTerminalDocument,
    "\n  mutation DestroyTerminal($terminalId: ID!) {\n    destroyTerminal(terminalId: $terminalId)\n  }\n": types.DestroyTerminalDocument,
    "\n  query OrgMembers($id: ID!) {\n    organization(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n        role\n        joinedAt\n      }\n    }\n  }\n": types.OrgMembersDocument,
    "\n  mutation EditChatMessage($messageId: ID!, $html: String!) {\n    editChatMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n": types.EditChatMessageDocument,
    "\n  mutation DeleteChatMessage($messageId: ID!) {\n    deleteChatMessage(messageId: $messageId) {\n      id\n    }\n  }\n": types.DeleteChatMessageDocument,
    "\n  mutation EditChannelMessage($messageId: ID!, $html: String!) {\n    editChannelMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n": types.EditChannelMessageDocument,
    "\n  mutation DeleteChannelMessage($messageId: ID!) {\n    deleteChannelMessage(messageId: $messageId) {\n      id\n    }\n  }\n": types.DeleteChannelMessageDocument,
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
export function graphql(source: "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroups($channelId: ID!) {\n    sessionGroups(channelId: $channelId) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"): (typeof documents)["\n  query SessionGroups($channelId: ID!) {\n    sessionGroups(channelId: $channelId) {\n      id\n      name\n      status\n      prUrl\n      worktreeDeleted\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {\n    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID) {\n    sendChatMessage(chatId: $chatId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"): (typeof documents)["\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n"): (typeof documents)["\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n"): (typeof documents)["\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n"): (typeof documents)["\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"): (typeof documents)["\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"): (typeof documents)["\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdAt\n        updatedAt\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      hosting\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdAt\n        updatedAt\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      status\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"): (typeof documents)["\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      status\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n      }\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        hosting\n        branch\n        worktreeDeleted\n        sessionGroupId\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {\n    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {\n      id\n      tool\n      model\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"): (typeof documents)["\n  query AgentIdentity($organizationId: ID!) {\n    agentIdentity(organizationId: $organizationId) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {\n    updateAgentSettings(organizationId: $organizationId, input: $input) {\n      id\n      name\n      status\n      autonomyMode\n      soulFile\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n"): (typeof documents)["\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"): (typeof documents)["\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n"): (typeof documents)["\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      members {\n        user {\n          id\n        }\n        joinedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation JoinChannel($channelId: ID!) {\n    joinChannel(channelId: $channelId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation LeaveChannel($channelId: ID!) {\n    leaveChannel(channelId: $channelId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateChannelGroupCollapse($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateChannel($input: CreateChannelInput!) {\n    createChannel(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateChannelGroup($input: CreateChannelGroupInput!) {\n    createChannelGroup(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateChat($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteChannelGroup($id: ID!) {\n    deleteChannelGroup(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) { id }\n  }\n"): (typeof documents)["\n  mutation MoveChannel($input: MoveChannelInput!) {\n    moveChannel(input: $input) { id }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) { id }\n  }\n"): (typeof documents)["\n  mutation UpdateChannelGroupPosition($id: ID!, $input: UpdateChannelGroupInput!) {\n    updateChannelGroup(id: $id, input: $input) { id }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) { id }\n  }\n"): (typeof documents)["\n  mutation ReorderChannels($input: ReorderChannelsInput!) {\n    reorderChannels(input: $input) { id }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"): (typeof documents)["\n  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {\n    channelMessages(channelId: $channelId, limit: $limit, before: $before) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {\n    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"): (typeof documents)["\n  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {\n    chatMessages(chatId: $chatId, limit: $limit, before: $before) {\n      id\n      chatId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {\n    chatEvents(chatId: $chatId, types: $types) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  subscription OrgEvents($organizationId: ID!) {\n    orgEvents(organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"): (typeof documents)["\n  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {\n    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      repo { id name }\n    }\n  }\n"): (typeof documents)["\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      position\n      groupId\n      baseBranch\n      repo { id name }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n"): (typeof documents)["\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"): (typeof documents)["\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n"): (typeof documents)["\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n      sessionGroupId\n    }\n  }\n"): (typeof documents)["\n  mutation StartSession($input: StartSessionInput!) {\n    startSession(input: $input) {\n      id\n      sessionGroupId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RunSession($id: ID!, $prompt: String, $interactionMode: String) {\n    runSession(id: $id, prompt: $prompt, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation SendSessionMessage($sessionId: ID!, $text: String!, $interactionMode: String) {\n    sendSessionMessage(sessionId: $sessionId, text: $text, interactionMode: $interactionMode) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation TerminateSession($id: ID!) {\n    terminateSession(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DismissSession($id: ID!) {\n    dismissSession(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DismissSession($id: ID!) {\n    dismissSession(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RetrySessionConnection($sessionId: ID!) {\n    retrySessionConnection(sessionId: $sessionId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation MoveSessionToRuntime($sessionId: ID!, $runtimeInstanceId: ID!) {\n    moveSessionToRuntime(sessionId: $sessionId, runtimeInstanceId: $runtimeInstanceId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MoveSessionToCloud($sessionId: ID!) {\n    moveSessionToCloud(sessionId: $sessionId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation MoveSessionToCloud($sessionId: ID!) {\n    moveSessionToCloud(sessionId: $sessionId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteSession($id: ID!) {\n    deleteSession(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteSession($id: ID!) {\n    deleteSession(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteSessionGroup($id: ID!) {\n    deleteSessionGroup(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteSessionGroup($id: ID!) {\n    deleteSessionGroup(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n"): (typeof documents)["\n  query AvailableSessionRuntimes($sessionId: ID!) {\n    availableSessionRuntimes(sessionId: $sessionId) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DismissInboxItem($id: ID!) {\n    dismissInboxItem(id: $id) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DismissInboxItem($id: ID!) {\n    dismissInboxItem(id: $id) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AcceptAgentSuggestion($inboxItemId: ID!, $edits: JSON) {\n    acceptAgentSuggestion(inboxItemId: $inboxItemId, edits: $edits) {\n      id\n      status\n      resolvedAt\n    }\n  }\n"): (typeof documents)["\n  mutation AcceptAgentSuggestion($inboxItemId: ID!, $edits: JSON) {\n    acceptAgentSuggestion(inboxItemId: $inboxItemId, edits: $edits) {\n      id\n      status\n      resolvedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DismissAgentSuggestion($inboxItemId: ID!) {\n    dismissAgentSuggestion(inboxItemId: $inboxItemId) {\n      id\n      status\n      resolvedAt\n    }\n  }\n"): (typeof documents)["\n  mutation DismissAgentSuggestion($inboxItemId: ID!) {\n    dismissAgentSuggestion(inboxItemId: $inboxItemId) {\n      id\n      status\n      resolvedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n"): (typeof documents)["\n  query AvailableRuntimes($tool: CodingTool!) {\n    availableRuntimes(tool: $tool) {\n      id\n      label\n      hostingMode\n      supportedTools\n      connected\n      sessionCount\n      registeredRepoIds\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {\n    updateRepo(id: $id, input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateRepo($id: ID!, $input: UpdateRepoInput!) {\n    updateRepo(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RegisterRepoWebhook($repoId: ID!) {\n    registerRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RegisterRepoWebhook($repoId: ID!) {\n    registerRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnregisterRepoWebhook($repoId: ID!) {\n    unregisterRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UnregisterRepoWebhook($repoId: ID!) {\n    unregisterRepoWebhook(repoId: $repoId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {\n    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)\n  }\n"): (typeof documents)["\n  query RepoBranches($repoId: ID!, $runtimeInstanceId: ID) {\n    repoBranches(repoId: $repoId, runtimeInstanceId: $runtimeInstanceId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SessionTerminals($sessionId: ID!) {\n    sessionTerminals(sessionId: $sessionId) {\n      id\n      sessionId\n    }\n  }\n"): (typeof documents)["\n  query SessionTerminals($sessionId: ID!) {\n    sessionTerminals(sessionId: $sessionId) {\n      id\n      sessionId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {\n    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {\n      id\n      sessionId\n    }\n  }\n"): (typeof documents)["\n  mutation CreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {\n    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {\n      id\n      sessionId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DestroyTerminal($terminalId: ID!) {\n    destroyTerminal(terminalId: $terminalId)\n  }\n"): (typeof documents)["\n  mutation DestroyTerminal($terminalId: ID!) {\n    destroyTerminal(terminalId: $terminalId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query OrgMembers($id: ID!) {\n    organization(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n        role\n        joinedAt\n      }\n    }\n  }\n"): (typeof documents)["\n  query OrgMembers($id: ID!) {\n    organization(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n        role\n        joinedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation EditChatMessage($messageId: ID!, $html: String!) {\n    editChatMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation EditChatMessage($messageId: ID!, $html: String!) {\n    editChatMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteChatMessage($messageId: ID!) {\n    deleteChatMessage(messageId: $messageId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteChatMessage($messageId: ID!) {\n    deleteChatMessage(messageId: $messageId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation EditChannelMessage($messageId: ID!, $html: String!) {\n    editChannelMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation EditChannelMessage($messageId: ID!, $html: String!) {\n    editChannelMessage(messageId: $messageId, html: $html) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteChannelMessage($messageId: ID!) {\n    deleteChannelMessage(messageId: $messageId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteChannelMessage($messageId: ID!) {\n    deleteChannelMessage(messageId: $messageId) {\n      id\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;
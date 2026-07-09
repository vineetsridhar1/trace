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
  "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n": typeof types.SendChannelMessageDocument;
  "\n  query ChannelMembers($id: ID!) {\n    channel(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n      }\n    }\n  }\n": typeof types.ChannelMembersDocument;
  "\n  mutation AddChannelMember($input: AddChannelMemberInput!) {\n    addChannelMember(input: $input) {\n      id\n    }\n  }\n": typeof types.AddChannelMemberDocument;
  "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupsDocument;
  "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      kind\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.FilteredSessionGroupsDocument;
  "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n": typeof types.AddChatMemberDocument;
  "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n": typeof types.SendChatMessageDocument;
  "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n": typeof types.RenameChatDocument;
  "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n": typeof types.ThreadRepliesDocument;
  "\n  query DesignArtifacts($sessionGroupId: ID!) {\n    designArtifacts(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      parentArtifactId\n      prompt\n      title\n      contentType\n      html\n      metadata\n      publishedAt\n      publicUrl\n      createdAt\n      updatedAt\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n": typeof types.DesignArtifactsDocument;
  "\n  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {\n    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {\n      id\n    }\n  }\n": typeof types.IterateDesignArtifactDocument;
  "\n  mutation PatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {\n    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {\n      id\n    }\n  }\n": typeof types.PatchDesignArtifactTokensDocument;
  "\n  mutation CommentDesignArtifact($artifactId: ID!, $body: String!, $sendToAgent: Boolean) {\n    commentDesignArtifact(artifactId: $artifactId, body: $body, sendToAgent: $sendToAgent) {\n      id\n    }\n  }\n": typeof types.CommentDesignArtifactDocument;
  "\n  mutation PublishDesignArtifact($artifactId: ID!) {\n    publishDesignArtifact(artifactId: $artifactId) {\n      id\n      publishedAt\n      publicUrl\n    }\n  }\n": typeof types.PublishDesignArtifactDocument;
  "\n  mutation ExportDesignArtifactPdf($artifactId: ID!) {\n    exportDesignArtifactPdf(artifactId: $artifactId) {\n      id\n    }\n  }\n": typeof types.ExportDesignArtifactPdfDocument;
  "\n  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!) {\n    promoteDesignArtifactToCodingSession(artifactId: $artifactId) {\n      id\n      sessionGroupId\n    }\n  }\n": typeof types.PromoteDesignArtifactToCodingSessionDocument;
  "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n": typeof types.SessionGroupBranchDiffDocument;
  "\n  query SessionGroupWorktreeChanges($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      files {\n        path\n        status\n        additions\n        deletions\n        diff\n        truncated\n        originalContent\n        modifiedContent\n        contentTruncated\n      }\n      totalCount\n      truncated\n    }\n  }\n": typeof types.SessionGroupWorktreeChangesDocument;
  "\n  mutation RevertSessionGroupFileChange($sessionGroupId: ID!, $filePath: String!) {\n    revertSessionGroupFileChange(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.RevertSessionGroupFileChangeDocument;
  "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n": typeof types.SessionGroupFileAtRefDocument;
  "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n": typeof types.SessionGroupFileContentForDiffDocument;
  "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContentWithSource(sessionGroupId: $sessionGroupId, filePath: $filePath) {\n      content\n      ref\n      requestedRef\n      usedFallback\n    }\n  }\n": typeof types.SessionGroupFileContentDocument;
  "\n  mutation SaveSessionGroupFile($sessionGroupId: ID!, $filePath: String!, $content: String!) {\n    saveSessionGroupFile(sessionGroupId: $sessionGroupId, filePath: $filePath, content: $content)\n  }\n": typeof types.SaveSessionGroupFileDocument;
  "\n  mutation CommitSessionGroupFileChanges($sessionGroupId: ID!, $message: String) {\n    commitSessionGroupFileChanges(sessionGroupId: $sessionGroupId, message: $message)\n  }\n": typeof types.CommitSessionGroupFileChangesDocument;
  "\n  query SessionGroupWorktreeChangesForCommitButton($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      totalCount\n    }\n  }\n": typeof types.SessionGroupWorktreeChangesForCommitButtonDocument;
  "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n        remoteUrl\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      inputTokens\n      outputTokens\n      cacheReadTokens\n      cacheCreationTokens\n      costUsd\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n          remoteUrl\n          applicationConfig {\n            setupScripts {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n            }\n            applications {\n              id\n              name\n              processes {\n                id\n                name\n                command\n                workingDirectory\n                env {\n                  key\n                  secretName\n                }\n                required\n                ports {\n                  id\n                  label\n                  port\n                  protocol\n                  defaultForwardingEnabled\n                  healthPath\n                }\n              }\n            }\n          }\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SessionDetailDocument;
  "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SessionGroupDetailDocument;
  "\n  query SessionApplicationsState($sessionGroupId: ID!) {\n    sessionGroup(id: $sessionGroupId) {\n      id\n      repo {\n        id\n        applicationConfig {\n          setupScripts {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n          }\n          applications {\n            id\n            name\n            processes {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n              required\n              ports {\n                id\n                label\n                port\n                protocol\n                defaultForwardingEnabled\n                healthPath\n              }\n            }\n          }\n        }\n      }\n    }\n    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      appConfigId\n      processConfigId\n      label\n      status\n      runtimeInstanceId\n      startedAt\n      stoppedAt\n      exitCode\n      lastError\n    }\n    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      scriptConfigId\n      label\n      command\n      workingDirectory\n      status\n      exitCode\n      outputPreview\n      outputTruncated\n      lastError\n      startedAt\n      completedAt\n    }\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n": typeof types.SessionApplicationsStateDocument;
  "\n  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {\n    sessionApplicationLogs(processId: $processId, limit: $limit) {\n      id\n      processId\n      stream\n      data\n      sequence\n      timestamp\n    }\n  }\n": typeof types.SessionApplicationProcessLogsDocument;
  "\n  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {\n    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)\n  }\n": typeof types.RunSessionGroupSetupScriptDocument;
  "\n  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    startSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n": typeof types.StartSessionProcessDocument;
  "\n  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    stopSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n": typeof types.StopSessionProcessDocument;
  "\n  mutation EnableSessionEndpointForwarding($endpointId: ID!) {\n    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {\n      id\n    }\n  }\n": typeof types.EnableSessionEndpointForwardingDocument;
  "\n  mutation DisableSessionEndpointForwarding($endpointId: ID!) {\n    disableSessionEndpointForwarding(endpointId: $endpointId) {\n      id\n    }\n  }\n": typeof types.DisableSessionEndpointForwardingDocument;
  "\n  query SessionEndpointTrafficEndpoints($sessionGroupId: ID!) {\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n": typeof types.SessionEndpointTrafficEndpointsDocument;
  "\n  query EndpointTrafficTab($endpointId: ID!, $limit: Int) {\n    endpointTraffic(endpointId: $endpointId, limit: $limit) {\n      id\n      endpointId\n      startedAt\n      durationMs\n      requestMethod\n      requestPath\n      responseStatus\n      error\n    }\n  }\n": typeof types.EndpointTrafficTabDocument;
  "\n  mutation ClearEndpointTrafficTab($endpointId: ID!) {\n    clearEndpointTraffic(endpointId: $endpointId)\n  }\n": typeof types.ClearEndpointTrafficTabDocument;
  "\n  query SessionGroupFileTree($sessionGroupId: ID!) {\n    sessionGroupFileTree(sessionGroupId: $sessionGroupId) {\n      paths\n      truncated\n    }\n  }\n": typeof types.SessionGroupFileTreeDocument;
  "\n  query SessionGroupDirectoryEntries($sessionGroupId: ID!, $directoryPath: String!, $depth: Int) {\n    sessionGroupDirectoryEntries(\n      sessionGroupId: $sessionGroupId\n      directoryPath: $directoryPath\n      depth: $depth\n    ) {\n      name\n      path\n      isDirectory\n    }\n  }\n": typeof types.SessionGroupDirectoryEntriesDocument;
  "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n": typeof types.SessionGroupFilesDocument;
  "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.MyApiTokensDocument;
  "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n": typeof types.SetApiTokenDocument;
  "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n": typeof types.DeleteApiTokenDocument;
  "\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n": typeof types.AddOrgMemberDocument;
  "\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n": typeof types.RemoveOrgMemberDocument;
  "\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n": typeof types.UpdateOrgMemberRoleDocument;
  "\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n": typeof types.SearchUsersDocument;
  "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n      applicationConfig {\n        setupScripts {\n          id\n          name\n          command\n          workingDirectory\n          env {\n            key\n            secretName\n          }\n        }\n        applications {\n          id\n          name\n          processes {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n            required\n            ports {\n              id\n              label\n              port\n              protocol\n              defaultForwardingEnabled\n              healthPath\n            }\n          }\n        }\n      }\n    }\n  }\n": typeof types.SettingsReposDocument;
  "\n  query AgentEnvironmentsSettings($orgId: ID!, $organizationId: ID!) {\n    agentEnvironments(orgId: $orgId) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n    myConnections {\n      bridge {\n        id\n        instanceId\n        label\n        hostingMode\n        connected\n      }\n      repos {\n        repo {\n          id\n          name\n        }\n      }\n    }\n  }\n": typeof types.AgentEnvironmentsSettingsDocument;
  "\n  query OrgSecrets($orgId: ID!) {\n    orgSecrets(orgId: $orgId) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.OrgSecretsDocument;
  "\n  mutation CreateAgentEnvironment($input: CreateAgentEnvironmentInput!) {\n    createAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.CreateAgentEnvironmentDocument;
  "\n  mutation UpdateAgentEnvironment($input: UpdateAgentEnvironmentInput!) {\n    updateAgentEnvironment(input: $input) {\n      id\n      orgId\n      name\n      adapterType\n      config\n      enabled\n      isDefault\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.UpdateAgentEnvironmentDocument;
  "\n  mutation DeleteAgentEnvironment($id: ID!) {\n    deleteAgentEnvironment(id: $id)\n  }\n": typeof types.DeleteAgentEnvironmentDocument;
  "\n  mutation TestAgentEnvironment($id: ID!) {\n    testAgentEnvironment(id: $id) {\n      ok\n      message\n    }\n  }\n": typeof types.TestAgentEnvironmentDocument;
  "\n  mutation SetOrgSecret($input: SetOrgSecretInput!) {\n    setOrgSecret(input: $input) {\n      id\n      orgId\n      name\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.SetOrgSecretDocument;
  "\n  mutation DeleteOrgSecret($orgId: ID!, $id: ID!) {\n    deleteOrgSecret(orgId: $orgId, id: $id)\n  }\n": typeof types.DeleteOrgSecretDocument;
  "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateRepoDocument;
  "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n": typeof types.CreateDmDocument;
  "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      visibility\n      memberCount\n      viewerIsMember\n    }\n  }\n": typeof types.AllChannelsDocument;
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
  "\n  query SearchMessagesPage($query: String!, $limit: Int) {\n    searchMessages(query: $query, limit: $limit) {\n      id\n      chatId\n      channelId\n      sessionId\n      sessionGroupId\n      text\n      createdAt\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n": typeof types.SearchMessagesPageDocument;
  "\n  query SessionTimeline(\n    $organizationId: ID!\n    $sessionId: ID!\n    $limit: Int\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionTimeline(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      limit: $limit\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      mode\n      hasOlder\n      items {\n        id\n        kind\n        event {\n          id\n          scopeType\n          scopeId\n          eventType\n          payload\n          actor {\n            type\n            id\n            name\n            avatarUrl\n          }\n          parentId\n          timestamp\n          metadata\n        }\n        collapsed {\n          id\n          startEventId\n          startTimestamp\n          endEventId\n          endTimestamp\n        }\n      }\n    }\n  }\n": typeof types.SessionTimelineDocument;
  "\n  query SessionEventsAroundEvent(\n    $organizationId: ID!\n    $sessionId: ID!\n    $eventId: ID!\n    $limit: Int\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionEventsAroundEvent(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      eventId: $eventId\n      limit: $limit\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsAroundEventDocument;
  "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $after: DateTime\n    $afterEventId: ID\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      after: $after\n      afterEventId: $afterEventId\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsDocument;
  "\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n": typeof types.SessionEventsLiveDocument;
  "\n  query SessionPromptIndex($organizationId: ID!, $sessionId: ID!) {\n    sessionPromptIndex(organizationId: $organizationId, sessionId: $sessionId) {\n      eventId\n      timestamp\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      preview\n      imageCount\n    }\n  }\n": typeof types.SessionPromptIndexDocument;
  "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      visibility\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      viewerIsMember\n      repo {\n        id\n        name\n      }\n    }\n  }\n": typeof types.ChannelsDocument;
  "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n": typeof types.ChannelGroupsDocument;
  "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.ReposDocument;
  "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n": typeof types.ChatsDocument;
  "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n": typeof types.InboxItemsDocument;
  "\n  query SidebarSessionGroups($channelId: ID!, $archived: Boolean, $includeActiveMerged: Boolean) {\n    sessionGroups(\n      channelId: $channelId\n      archived: $archived\n      includeActiveMerged: $includeActiveMerged\n    ) {\n      id\n      name\n      kind\n      slug\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n": typeof types.SidebarSessionGroupsDocument;
  "\n  query OnboardingRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n": typeof types.OnboardingReposDocument;
  "\n  query OnboardingSessions($organizationId: ID!) {\n    sessions(organizationId: $organizationId) {\n      id\n    }\n  }\n": typeof types.OnboardingSessionsDocument;
};
const documents: Documents = {
  "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n":
    types.SendChannelMessageDocument,
  "\n  query ChannelMembers($id: ID!) {\n    channel(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n      }\n    }\n  }\n":
    types.ChannelMembersDocument,
  "\n  mutation AddChannelMember($input: AddChannelMemberInput!) {\n    addChannelMember(input: $input) {\n      id\n    }\n  }\n":
    types.AddChannelMemberDocument,
  "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.SessionGroupsDocument,
  "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      kind\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.FilteredSessionGroupsDocument,
  "\n  mutation AddChatMember($input: AddChatMemberInput!) {\n    addChatMember(input: $input) {\n      id\n    }\n  }\n":
    types.AddChatMemberDocument,
  "\n  mutation SendChatMessage($chatId: ID!, $html: String, $parentId: ID, $clientMutationId: String) {\n    sendChatMessage(\n      chatId: $chatId\n      html: $html\n      parentId: $parentId\n      clientMutationId: $clientMutationId\n    ) {\n      id\n    }\n  }\n":
    types.SendChatMessageDocument,
  "\n  mutation RenameChat($chatId: ID!, $name: String!) {\n    renameChat(chatId: $chatId, name: $name) {\n      id\n      name\n    }\n  }\n":
    types.RenameChatDocument,
  "\n  query ThreadReplies($rootMessageId: ID!, $limit: Int) {\n    threadReplies(rootMessageId: $rootMessageId, limit: $limit) {\n      id\n      chatId\n      channelId\n      text\n      html\n      mentions\n      parentMessageId\n      replyCount\n      latestReplyAt\n      threadRepliers {\n        type\n        id\n        name\n        avatarUrl\n      }\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      createdAt\n      updatedAt\n      editedAt\n      deletedAt\n    }\n  }\n":
    types.ThreadRepliesDocument,
  "\n  query DesignArtifacts($sessionGroupId: ID!) {\n    designArtifacts(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      parentArtifactId\n      prompt\n      title\n      contentType\n      html\n      metadata\n      publishedAt\n      publicUrl\n      createdAt\n      updatedAt\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n":
    types.DesignArtifactsDocument,
  "\n  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {\n    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {\n      id\n    }\n  }\n":
    types.IterateDesignArtifactDocument,
  "\n  mutation PatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {\n    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {\n      id\n    }\n  }\n":
    types.PatchDesignArtifactTokensDocument,
  "\n  mutation CommentDesignArtifact($artifactId: ID!, $body: String!, $sendToAgent: Boolean) {\n    commentDesignArtifact(artifactId: $artifactId, body: $body, sendToAgent: $sendToAgent) {\n      id\n    }\n  }\n":
    types.CommentDesignArtifactDocument,
  "\n  mutation PublishDesignArtifact($artifactId: ID!) {\n    publishDesignArtifact(artifactId: $artifactId) {\n      id\n      publishedAt\n      publicUrl\n    }\n  }\n":
    types.PublishDesignArtifactDocument,
  "\n  mutation ExportDesignArtifactPdf($artifactId: ID!) {\n    exportDesignArtifactPdf(artifactId: $artifactId) {\n      id\n    }\n  }\n":
    types.ExportDesignArtifactPdfDocument,
  "\n  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!) {\n    promoteDesignArtifactToCodingSession(artifactId: $artifactId) {\n      id\n      sessionGroupId\n    }\n  }\n":
    types.PromoteDesignArtifactToCodingSessionDocument,
  "\n  query SessionGroupBranchDiff($sessionGroupId: ID!) {\n    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {\n      path\n      status\n      additions\n      deletions\n    }\n  }\n":
    types.SessionGroupBranchDiffDocument,
  "\n  query SessionGroupWorktreeChanges($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      files {\n        path\n        status\n        additions\n        deletions\n        diff\n        truncated\n        originalContent\n        modifiedContent\n        contentTruncated\n      }\n      totalCount\n      truncated\n    }\n  }\n":
    types.SessionGroupWorktreeChangesDocument,
  "\n  mutation RevertSessionGroupFileChange($sessionGroupId: ID!, $filePath: String!) {\n    revertSessionGroupFileChange(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n":
    types.RevertSessionGroupFileChangeDocument,
  "\n  query SessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {\n    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)\n  }\n":
    types.SessionGroupFileAtRefDocument,
  "\n  query SessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n":
    types.SessionGroupFileContentForDiffDocument,
  "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContentWithSource(sessionGroupId: $sessionGroupId, filePath: $filePath) {\n      content\n      ref\n      requestedRef\n      usedFallback\n    }\n  }\n":
    types.SessionGroupFileContentDocument,
  "\n  mutation SaveSessionGroupFile($sessionGroupId: ID!, $filePath: String!, $content: String!) {\n    saveSessionGroupFile(sessionGroupId: $sessionGroupId, filePath: $filePath, content: $content)\n  }\n":
    types.SaveSessionGroupFileDocument,
  "\n  mutation CommitSessionGroupFileChanges($sessionGroupId: ID!, $message: String) {\n    commitSessionGroupFileChanges(sessionGroupId: $sessionGroupId, message: $message)\n  }\n":
    types.CommitSessionGroupFileChangesDocument,
  "\n  query SessionGroupWorktreeChangesForCommitButton($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      totalCount\n    }\n  }\n":
    types.SessionGroupWorktreeChangesForCommitButtonDocument,
  "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n        remoteUrl\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      inputTokens\n      outputTokens\n      cacheReadTokens\n      cacheCreationTokens\n      costUsd\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n          remoteUrl\n          applicationConfig {\n            setupScripts {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n            }\n            applications {\n              id\n              name\n              processes {\n                id\n                name\n                command\n                workingDirectory\n                env {\n                  key\n                  secretName\n                }\n                required\n                ports {\n                  id\n                  label\n                  port\n                  protocol\n                  defaultForwardingEnabled\n                  healthPath\n                }\n              }\n            }\n          }\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.SessionDetailDocument,
  "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.SessionGroupDetailDocument,
  "\n  query SessionApplicationsState($sessionGroupId: ID!) {\n    sessionGroup(id: $sessionGroupId) {\n      id\n      repo {\n        id\n        applicationConfig {\n          setupScripts {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n          }\n          applications {\n            id\n            name\n            processes {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n              required\n              ports {\n                id\n                label\n                port\n                protocol\n                defaultForwardingEnabled\n                healthPath\n              }\n            }\n          }\n        }\n      }\n    }\n    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      appConfigId\n      processConfigId\n      label\n      status\n      runtimeInstanceId\n      startedAt\n      stoppedAt\n      exitCode\n      lastError\n    }\n    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      scriptConfigId\n      label\n      command\n      workingDirectory\n      status\n      exitCode\n      outputPreview\n      outputTruncated\n      lastError\n      startedAt\n      completedAt\n    }\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n":
    types.SessionApplicationsStateDocument,
  "\n  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {\n    sessionApplicationLogs(processId: $processId, limit: $limit) {\n      id\n      processId\n      stream\n      data\n      sequence\n      timestamp\n    }\n  }\n":
    types.SessionApplicationProcessLogsDocument,
  "\n  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {\n    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)\n  }\n":
    types.RunSessionGroupSetupScriptDocument,
  "\n  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    startSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n":
    types.StartSessionProcessDocument,
  "\n  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    stopSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n":
    types.StopSessionProcessDocument,
  "\n  mutation EnableSessionEndpointForwarding($endpointId: ID!) {\n    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {\n      id\n    }\n  }\n":
    types.EnableSessionEndpointForwardingDocument,
  "\n  mutation DisableSessionEndpointForwarding($endpointId: ID!) {\n    disableSessionEndpointForwarding(endpointId: $endpointId) {\n      id\n    }\n  }\n":
    types.DisableSessionEndpointForwardingDocument,
  "\n  query SessionEndpointTrafficEndpoints($sessionGroupId: ID!) {\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n":
    types.SessionEndpointTrafficEndpointsDocument,
  "\n  query EndpointTrafficTab($endpointId: ID!, $limit: Int) {\n    endpointTraffic(endpointId: $endpointId, limit: $limit) {\n      id\n      endpointId\n      startedAt\n      durationMs\n      requestMethod\n      requestPath\n      responseStatus\n      error\n    }\n  }\n":
    types.EndpointTrafficTabDocument,
  "\n  mutation ClearEndpointTrafficTab($endpointId: ID!) {\n    clearEndpointTraffic(endpointId: $endpointId)\n  }\n":
    types.ClearEndpointTrafficTabDocument,
  "\n  query SessionGroupFileTree($sessionGroupId: ID!) {\n    sessionGroupFileTree(sessionGroupId: $sessionGroupId) {\n      paths\n      truncated\n    }\n  }\n":
    types.SessionGroupFileTreeDocument,
  "\n  query SessionGroupDirectoryEntries($sessionGroupId: ID!, $directoryPath: String!, $depth: Int) {\n    sessionGroupDirectoryEntries(\n      sessionGroupId: $sessionGroupId\n      directoryPath: $directoryPath\n      depth: $depth\n    ) {\n      name\n      path\n      isDirectory\n    }\n  }\n":
    types.SessionGroupDirectoryEntriesDocument,
  "\n  query SessionGroupFiles($sessionGroupId: ID!) {\n    sessionGroupFiles(sessionGroupId: $sessionGroupId)\n  }\n":
    types.SessionGroupFilesDocument,
  "\n  query MyApiTokens {\n    myApiTokens {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n":
    types.MyApiTokensDocument,
  "\n  mutation SetApiToken($input: SetApiTokenInput!) {\n    setApiToken(input: $input) {\n      provider\n      isSet\n      updatedAt\n    }\n  }\n":
    types.SetApiTokenDocument,
  "\n  mutation DeleteApiToken($provider: ApiTokenProvider!) {\n    deleteApiToken(provider: $provider)\n  }\n":
    types.DeleteApiTokenDocument,
  "\n  mutation AddOrgMember($organizationId: ID!, $userId: ID!, $role: UserRole) {\n    addOrgMember(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n        name\n        email\n        avatarUrl\n      }\n      role\n      joinedAt\n    }\n  }\n":
    types.AddOrgMemberDocument,
  "\n  mutation RemoveOrgMember($organizationId: ID!, $userId: ID!) {\n    removeOrgMember(organizationId: $organizationId, userId: $userId)\n  }\n":
    types.RemoveOrgMemberDocument,
  "\n  mutation UpdateOrgMemberRole($organizationId: ID!, $userId: ID!, $role: UserRole!) {\n    updateOrgMemberRole(organizationId: $organizationId, userId: $userId, role: $role) {\n      user {\n        id\n      }\n      role\n    }\n  }\n":
    types.UpdateOrgMemberRoleDocument,
  "\n  query SearchUsers($query: String!) {\n    searchUsers(query: $query) {\n      id\n      name\n      email\n      avatarUrl\n    }\n  }\n":
    types.SearchUsersDocument,
  "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n      applicationConfig {\n        setupScripts {\n          id\n          name\n          command\n          workingDirectory\n          env {\n            key\n            secretName\n          }\n        }\n        applications {\n          id\n          name\n          processes {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n            required\n            ports {\n              id\n              label\n              port\n              protocol\n              defaultForwardingEnabled\n              healthPath\n            }\n          }\n        }\n      }\n    }\n  }\n":
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
  "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n":
    types.CreateRepoDocument,
  "\n  mutation CreateDM($input: CreateChatInput!) {\n    createChat(input: $input) {\n      id\n    }\n  }\n":
    types.CreateDmDocument,
  "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      visibility\n      memberCount\n      viewerIsMember\n    }\n  }\n":
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
  "\n  query SearchMessagesPage($query: String!, $limit: Int) {\n    searchMessages(query: $query, limit: $limit) {\n      id\n      chatId\n      channelId\n      sessionId\n      sessionGroupId\n      text\n      createdAt\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n":
    types.SearchMessagesPageDocument,
  "\n  query SessionTimeline(\n    $organizationId: ID!\n    $sessionId: ID!\n    $limit: Int\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionTimeline(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      limit: $limit\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      mode\n      hasOlder\n      items {\n        id\n        kind\n        event {\n          id\n          scopeType\n          scopeId\n          eventType\n          payload\n          actor {\n            type\n            id\n            name\n            avatarUrl\n          }\n          parentId\n          timestamp\n          metadata\n        }\n        collapsed {\n          id\n          startEventId\n          startTimestamp\n          endEventId\n          endTimestamp\n        }\n      }\n    }\n  }\n":
    types.SessionTimelineDocument,
  "\n  query SessionEventsAroundEvent(\n    $organizationId: ID!\n    $sessionId: ID!\n    $eventId: ID!\n    $limit: Int\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionEventsAroundEvent(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      eventId: $eventId\n      limit: $limit\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.SessionEventsAroundEventDocument,
  "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $after: DateTime\n    $afterEventId: ID\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      after: $after\n      afterEventId: $afterEventId\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.SessionEventsDocument,
  "\n  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {\n    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n":
    types.SessionEventsLiveDocument,
  "\n  query SessionPromptIndex($organizationId: ID!, $sessionId: ID!) {\n    sessionPromptIndex(organizationId: $organizationId, sessionId: $sessionId) {\n      eventId\n      timestamp\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      preview\n      imageCount\n    }\n  }\n":
    types.SessionPromptIndexDocument,
  "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      visibility\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      viewerIsMember\n      repo {\n        id\n        name\n      }\n    }\n  }\n":
    types.ChannelsDocument,
  "\n  query ChannelGroups($organizationId: ID!) {\n    channelGroups(organizationId: $organizationId) {\n      id\n      name\n      position\n      isCollapsed\n    }\n  }\n":
    types.ChannelGroupsDocument,
  "\n  query Repos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n    }\n  }\n":
    types.ReposDocument,
  "\n  query Chats {\n    chats {\n      id\n      type\n      name\n      members {\n        user {\n          id\n          name\n          avatarUrl\n        }\n        joinedAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n":
    types.ChatsDocument,
  "\n  query InboxItems($organizationId: ID!) {\n    inboxItems(organizationId: $organizationId) {\n      id\n      itemType\n      status\n      title\n      summary\n      payload\n      userId\n      sourceType\n      sourceId\n      createdAt\n      resolvedAt\n    }\n  }\n":
    types.InboxItemsDocument,
  "\n  query SidebarSessionGroups($channelId: ID!, $archived: Boolean, $includeActiveMerged: Boolean) {\n    sessionGroups(\n      channelId: $channelId\n      archived: $archived\n      includeActiveMerged: $includeActiveMerged\n    ) {\n      id\n      name\n      kind\n      slug\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n":
    types.SidebarSessionGroupsDocument,
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
  source: "\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation SendChannelMessage($channelId: ID!, $html: String, $parentId: ID) {\n    sendChannelMessage(channelId: $channelId, html: $html, parentId: $parentId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query ChannelMembers($id: ID!) {\n    channel(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query ChannelMembers($id: ID!) {\n    channel(id: $id) {\n      id\n      members {\n        user {\n          id\n          name\n          email\n          avatarUrl\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation AddChannelMember($input: AddChannelMemberInput!) {\n    addChannelMember(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation AddChannelMember($input: AddChannelMemberInput!) {\n    addChannelMember(input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroups($channelId: ID!, $archived: Boolean) {\n    sessionGroups(channelId: $channelId, archived: $archived) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      kind\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query FilteredSessionGroups($channelId: ID!, $archived: Boolean, $status: SessionGroupStatus) {\n    sessionGroups(channelId: $channelId, archived: $archived, status: $status) {\n      id\n      name\n      kind\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
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
  source: "\n  query DesignArtifacts($sessionGroupId: ID!) {\n    designArtifacts(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      parentArtifactId\n      prompt\n      title\n      contentType\n      html\n      metadata\n      publishedAt\n      publicUrl\n      createdAt\n      updatedAt\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n",
): (typeof documents)["\n  query DesignArtifacts($sessionGroupId: ID!) {\n    designArtifacts(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      parentArtifactId\n      prompt\n      title\n      contentType\n      html\n      metadata\n      publishedAt\n      publicUrl\n      createdAt\n      updatedAt\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {\n    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation IterateDesignArtifact($artifactId: ID!, $prompt: String!) {\n    iterateDesignArtifact(artifactId: $artifactId, prompt: $prompt) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation PatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {\n    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation PatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {\n    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CommentDesignArtifact($artifactId: ID!, $body: String!, $sendToAgent: Boolean) {\n    commentDesignArtifact(artifactId: $artifactId, body: $body, sendToAgent: $sendToAgent) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CommentDesignArtifact($artifactId: ID!, $body: String!, $sendToAgent: Boolean) {\n    commentDesignArtifact(artifactId: $artifactId, body: $body, sendToAgent: $sendToAgent) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation PublishDesignArtifact($artifactId: ID!) {\n    publishDesignArtifact(artifactId: $artifactId) {\n      id\n      publishedAt\n      publicUrl\n    }\n  }\n",
): (typeof documents)["\n  mutation PublishDesignArtifact($artifactId: ID!) {\n    publishDesignArtifact(artifactId: $artifactId) {\n      id\n      publishedAt\n      publicUrl\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation ExportDesignArtifactPdf($artifactId: ID!) {\n    exportDesignArtifactPdf(artifactId: $artifactId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation ExportDesignArtifactPdf($artifactId: ID!) {\n    exportDesignArtifactPdf(artifactId: $artifactId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!) {\n    promoteDesignArtifactToCodingSession(artifactId: $artifactId) {\n      id\n      sessionGroupId\n    }\n  }\n",
): (typeof documents)["\n  mutation PromoteDesignArtifactToCodingSession($artifactId: ID!) {\n    promoteDesignArtifactToCodingSession(artifactId: $artifactId) {\n      id\n      sessionGroupId\n    }\n  }\n"];
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
  source: "\n  query SessionGroupWorktreeChanges($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      files {\n        path\n        status\n        additions\n        deletions\n        diff\n        truncated\n        originalContent\n        modifiedContent\n        contentTruncated\n      }\n      totalCount\n      truncated\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupWorktreeChanges($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      files {\n        path\n        status\n        additions\n        deletions\n        diff\n        truncated\n        originalContent\n        modifiedContent\n        contentTruncated\n      }\n      totalCount\n      truncated\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation RevertSessionGroupFileChange($sessionGroupId: ID!, $filePath: String!) {\n    revertSessionGroupFileChange(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n",
): (typeof documents)["\n  mutation RevertSessionGroupFileChange($sessionGroupId: ID!, $filePath: String!) {\n    revertSessionGroupFileChange(sessionGroupId: $sessionGroupId, filePath: $filePath)\n  }\n"];
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
  source: "\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContentWithSource(sessionGroupId: $sessionGroupId, filePath: $filePath) {\n      content\n      ref\n      requestedRef\n      usedFallback\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {\n    sessionGroupFileContentWithSource(sessionGroupId: $sessionGroupId, filePath: $filePath) {\n      content\n      ref\n      requestedRef\n      usedFallback\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation SaveSessionGroupFile($sessionGroupId: ID!, $filePath: String!, $content: String!) {\n    saveSessionGroupFile(sessionGroupId: $sessionGroupId, filePath: $filePath, content: $content)\n  }\n",
): (typeof documents)["\n  mutation SaveSessionGroupFile($sessionGroupId: ID!, $filePath: String!, $content: String!) {\n    saveSessionGroupFile(sessionGroupId: $sessionGroupId, filePath: $filePath, content: $content)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation CommitSessionGroupFileChanges($sessionGroupId: ID!, $message: String) {\n    commitSessionGroupFileChanges(sessionGroupId: $sessionGroupId, message: $message)\n  }\n",
): (typeof documents)["\n  mutation CommitSessionGroupFileChanges($sessionGroupId: ID!, $message: String) {\n    commitSessionGroupFileChanges(sessionGroupId: $sessionGroupId, message: $message)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupWorktreeChangesForCommitButton($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      totalCount\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupWorktreeChangesForCommitButton($sessionGroupId: ID!) {\n    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n        remoteUrl\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      inputTokens\n      outputTokens\n      cacheReadTokens\n      cacheCreationTokens\n      costUsd\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n          remoteUrl\n          applicationConfig {\n            setupScripts {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n            }\n            applications {\n              id\n              name\n              processes {\n                id\n                name\n                command\n                workingDirectory\n                env {\n                  key\n                  secretName\n                }\n                required\n                ports {\n                  id\n                  label\n                  port\n                  protocol\n                  defaultForwardingEnabled\n                  healthPath\n                }\n              }\n            }\n          }\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n",
): (typeof documents)["\n  query SessionDetail($id: ID!) {\n    session(id: $id) {\n      id\n      name\n      agentStatus\n      sessionStatus\n      tool\n      model\n      reasoningEffort\n      hosting\n      repo {\n        id\n        name\n        remoteUrl\n      }\n      branch\n      workdir\n      prUrl\n      worktreeDeleted\n      lastUserMessageAt\n      lastMessageAt\n      inputTokens\n      outputTokens\n      cacheReadTokens\n      cacheCreationTokens\n      costUsd\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdBy {\n        id\n        name\n        avatarUrl\n      }\n      sessionGroupId\n      sessionGroup {\n        id\n        name\n        branch\n        prUrl\n        workdir\n        worktreeDeleted\n        gitCheckpoints {\n          id\n          sessionId\n          promptEventId\n          commitSha\n          subject\n          author\n          committedAt\n          filesChanged\n          createdAt\n        }\n        channel {\n          id\n        }\n        repo {\n          id\n          name\n          remoteUrl\n          applicationConfig {\n            setupScripts {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n            }\n            applications {\n              id\n              name\n              processes {\n                id\n                name\n                command\n                workingDirectory\n                env {\n                  key\n                  secretName\n                }\n                required\n                ports {\n                  id\n                  label\n                  port\n                  protocol\n                  defaultForwardingEnabled\n                  healthPath\n                }\n              }\n            }\n          }\n        }\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdAt\n        updatedAt\n        setupStatus\n        setupError\n      }\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      channel {\n        id\n      }\n      queuedMessages {\n        id\n        sessionId\n        text\n        imageKeys: attachmentKeys\n        interactionMode\n        position\n        createdAt\n      }\n      createdAt\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupDetail($id: ID!) {\n    sessionGroup(id: $id) {\n      id\n      name\n      kind\n      slug\n      forkedFromSessionGroupId\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      archivedAt\n      branch\n      prUrl\n      workdir\n      worktreeDeleted\n      gitCheckpoints {\n        id\n        sessionId\n        promptEventId\n        commitSha\n        subject\n        author\n        committedAt\n        filesChanged\n        createdAt\n      }\n      repo {\n        id\n        name\n        remoteUrl\n        defaultBranch\n      }\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      channel {\n        id\n      }\n      setupStatus\n      setupError\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n          remoteUrl\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionApplicationsState($sessionGroupId: ID!) {\n    sessionGroup(id: $sessionGroupId) {\n      id\n      repo {\n        id\n        applicationConfig {\n          setupScripts {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n          }\n          applications {\n            id\n            name\n            processes {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n              required\n              ports {\n                id\n                label\n                port\n                protocol\n                defaultForwardingEnabled\n                healthPath\n              }\n            }\n          }\n        }\n      }\n    }\n    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      appConfigId\n      processConfigId\n      label\n      status\n      runtimeInstanceId\n      startedAt\n      stoppedAt\n      exitCode\n      lastError\n    }\n    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      scriptConfigId\n      label\n      command\n      workingDirectory\n      status\n      exitCode\n      outputPreview\n      outputTruncated\n      lastError\n      startedAt\n      completedAt\n    }\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n",
): (typeof documents)["\n  query SessionApplicationsState($sessionGroupId: ID!) {\n    sessionGroup(id: $sessionGroupId) {\n      id\n      repo {\n        id\n        applicationConfig {\n          setupScripts {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n          }\n          applications {\n            id\n            name\n            processes {\n              id\n              name\n              command\n              workingDirectory\n              env {\n                key\n                secretName\n              }\n              required\n              ports {\n                id\n                label\n                port\n                protocol\n                defaultForwardingEnabled\n                healthPath\n              }\n            }\n          }\n        }\n      }\n    }\n    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      appConfigId\n      processConfigId\n      label\n      status\n      runtimeInstanceId\n      startedAt\n      stoppedAt\n      exitCode\n      lastError\n    }\n    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {\n      id\n      sessionGroupId\n      scriptConfigId\n      label\n      command\n      workingDirectory\n      status\n      exitCode\n      outputPreview\n      outputTruncated\n      lastError\n      startedAt\n      completedAt\n    }\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {\n    sessionApplicationLogs(processId: $processId, limit: $limit) {\n      id\n      processId\n      stream\n      data\n      sequence\n      timestamp\n    }\n  }\n",
): (typeof documents)["\n  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {\n    sessionApplicationLogs(processId: $processId, limit: $limit) {\n      id\n      processId\n      stream\n      data\n      sequence\n      timestamp\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {\n    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)\n  }\n",
): (typeof documents)["\n  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {\n    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    startSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    startSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    stopSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {\n    stopSessionProcess(\n      sessionGroupId: $sessionGroupId\n      appConfigId: $appConfigId\n      processConfigId: $processConfigId\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation EnableSessionEndpointForwarding($endpointId: ID!) {\n    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation EnableSessionEndpointForwarding($endpointId: ID!) {\n    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation DisableSessionEndpointForwarding($endpointId: ID!) {\n    disableSessionEndpointForwarding(endpointId: $endpointId) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation DisableSessionEndpointForwarding($endpointId: ID!) {\n    disableSessionEndpointForwarding(endpointId: $endpointId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionEndpointTrafficEndpoints($sessionGroupId: ID!) {\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n",
): (typeof documents)["\n  query SessionEndpointTrafficEndpoints($sessionGroupId: ID!) {\n    sessionEndpoints(sessionGroupId: $sessionGroupId) {\n      id\n      key\n      url\n      sessionGroupId\n      appConfigId\n      processConfigId\n      portConfigId\n      label\n      targetPort\n      status\n      accessMode\n      trafficCaptureMode\n      enabledAt\n      disabledAt\n      revokedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query EndpointTrafficTab($endpointId: ID!, $limit: Int) {\n    endpointTraffic(endpointId: $endpointId, limit: $limit) {\n      id\n      endpointId\n      startedAt\n      durationMs\n      requestMethod\n      requestPath\n      responseStatus\n      error\n    }\n  }\n",
): (typeof documents)["\n  query EndpointTrafficTab($endpointId: ID!, $limit: Int) {\n    endpointTraffic(endpointId: $endpointId, limit: $limit) {\n      id\n      endpointId\n      startedAt\n      durationMs\n      requestMethod\n      requestPath\n      responseStatus\n      error\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  mutation ClearEndpointTrafficTab($endpointId: ID!) {\n    clearEndpointTraffic(endpointId: $endpointId)\n  }\n",
): (typeof documents)["\n  mutation ClearEndpointTrafficTab($endpointId: ID!) {\n    clearEndpointTraffic(endpointId: $endpointId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupFileTree($sessionGroupId: ID!) {\n    sessionGroupFileTree(sessionGroupId: $sessionGroupId) {\n      paths\n      truncated\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupFileTree($sessionGroupId: ID!) {\n    sessionGroupFileTree(sessionGroupId: $sessionGroupId) {\n      paths\n      truncated\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionGroupDirectoryEntries($sessionGroupId: ID!, $directoryPath: String!, $depth: Int) {\n    sessionGroupDirectoryEntries(\n      sessionGroupId: $sessionGroupId\n      directoryPath: $directoryPath\n      depth: $depth\n    ) {\n      name\n      path\n      isDirectory\n    }\n  }\n",
): (typeof documents)["\n  query SessionGroupDirectoryEntries($sessionGroupId: ID!, $directoryPath: String!, $depth: Int) {\n    sessionGroupDirectoryEntries(\n      sessionGroupId: $sessionGroupId\n      directoryPath: $directoryPath\n      depth: $depth\n    ) {\n      name\n      path\n      isDirectory\n    }\n  }\n"];
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
  source: "\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n      applicationConfig {\n        setupScripts {\n          id\n          name\n          command\n          workingDirectory\n          env {\n            key\n            secretName\n          }\n        }\n        applications {\n          id\n          name\n          processes {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n            required\n            ports {\n              id\n              label\n              port\n              protocol\n              defaultForwardingEnabled\n              healthPath\n            }\n          }\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SettingsRepos($organizationId: ID!) {\n    repos(organizationId: $organizationId) {\n      id\n      name\n      remoteUrl\n      defaultBranch\n      webhookActive\n      applicationConfig {\n        setupScripts {\n          id\n          name\n          command\n          workingDirectory\n          env {\n            key\n            secretName\n          }\n        }\n        applications {\n          id\n          name\n          processes {\n            id\n            name\n            command\n            workingDirectory\n            env {\n              key\n              secretName\n            }\n            required\n            ports {\n              id\n              label\n              port\n              protocol\n              defaultForwardingEnabled\n              healthPath\n            }\n          }\n        }\n      }\n    }\n  }\n"];
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
  source: "\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n",
): (typeof documents)["\n  mutation CreateRepo($input: CreateRepoInput!) {\n    createRepo(input: $input) {\n      id\n    }\n  }\n"];
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
  source: "\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      visibility\n      memberCount\n      viewerIsMember\n    }\n  }\n",
): (typeof documents)["\n  query AllChannels($organizationId: ID!) {\n    channels(organizationId: $organizationId) {\n      id\n      name\n      type\n      visibility\n      memberCount\n      viewerIsMember\n    }\n  }\n"];
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
  source: "\n  query SearchMessagesPage($query: String!, $limit: Int) {\n    searchMessages(query: $query, limit: $limit) {\n      id\n      chatId\n      channelId\n      sessionId\n      sessionGroupId\n      text\n      createdAt\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SearchMessagesPage($query: String!, $limit: Int) {\n    searchMessages(query: $query, limit: $limit) {\n      id\n      chatId\n      channelId\n      sessionId\n      sessionGroupId\n      text\n      createdAt\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionTimeline(\n    $organizationId: ID!\n    $sessionId: ID!\n    $limit: Int\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionTimeline(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      limit: $limit\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      mode\n      hasOlder\n      items {\n        id\n        kind\n        event {\n          id\n          scopeType\n          scopeId\n          eventType\n          payload\n          actor {\n            type\n            id\n            name\n            avatarUrl\n          }\n          parentId\n          timestamp\n          metadata\n        }\n        collapsed {\n          id\n          startEventId\n          startTimestamp\n          endEventId\n          endTimestamp\n        }\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SessionTimeline(\n    $organizationId: ID!\n    $sessionId: ID!\n    $limit: Int\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionTimeline(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      limit: $limit\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      mode\n      hasOlder\n      items {\n        id\n        kind\n        event {\n          id\n          scopeType\n          scopeId\n          eventType\n          payload\n          actor {\n            type\n            id\n            name\n            avatarUrl\n          }\n          parentId\n          timestamp\n          metadata\n        }\n        collapsed {\n          id\n          startEventId\n          startTimestamp\n          endEventId\n          endTimestamp\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionEventsAroundEvent(\n    $organizationId: ID!\n    $sessionId: ID!\n    $eventId: ID!\n    $limit: Int\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionEventsAroundEvent(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      eventId: $eventId\n      limit: $limit\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  query SessionEventsAroundEvent(\n    $organizationId: ID!\n    $sessionId: ID!\n    $eventId: ID!\n    $limit: Int\n    $excludePayloadTypes: [String!]\n  ) {\n    sessionEventsAroundEvent(\n      organizationId: $organizationId\n      sessionId: $sessionId\n      eventId: $eventId\n      limit: $limit\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $after: DateTime\n    $afterEventId: ID\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      after: $after\n      afterEventId: $afterEventId\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n",
): (typeof documents)["\n  query SessionEvents(\n    $organizationId: ID!\n    $scope: ScopeInput\n    $limit: Int\n    $after: DateTime\n    $afterEventId: ID\n    $before: DateTime\n    $beforeEventId: ID\n    $excludePayloadTypes: [String!]\n  ) {\n    events(\n      organizationId: $organizationId\n      scope: $scope\n      limit: $limit\n      after: $after\n      afterEventId: $afterEventId\n      before: $before\n      beforeEventId: $beforeEventId\n      excludePayloadTypes: $excludePayloadTypes\n    ) {\n      id\n      scopeType\n      scopeId\n      eventType\n      payload\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      parentId\n      timestamp\n      metadata\n    }\n  }\n"];
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
  source: "\n  query SessionPromptIndex($organizationId: ID!, $sessionId: ID!) {\n    sessionPromptIndex(organizationId: $organizationId, sessionId: $sessionId) {\n      eventId\n      timestamp\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      preview\n      imageCount\n    }\n  }\n",
): (typeof documents)["\n  query SessionPromptIndex($organizationId: ID!, $sessionId: ID!) {\n    sessionPromptIndex(organizationId: $organizationId, sessionId: $sessionId) {\n      eventId\n      timestamp\n      actor {\n        type\n        id\n        name\n        avatarUrl\n      }\n      preview\n      imageCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: "\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      visibility\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      viewerIsMember\n      repo {\n        id\n        name\n      }\n    }\n  }\n",
): (typeof documents)["\n  query Channels($organizationId: ID!, $memberOnly: Boolean) {\n    channels(organizationId: $organizationId, memberOnly: $memberOnly) {\n      id\n      name\n      type\n      visibility\n      position\n      groupId\n      baseBranch\n      setupScript\n      runScripts\n      viewerIsMember\n      repo {\n        id\n        name\n      }\n    }\n  }\n"];
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
  source: "\n  query SidebarSessionGroups($channelId: ID!, $archived: Boolean, $includeActiveMerged: Boolean) {\n    sessionGroups(\n      channelId: $channelId\n      archived: $archived\n      includeActiveMerged: $includeActiveMerged\n    ) {\n      id\n      name\n      kind\n      slug\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n",
): (typeof documents)["\n  query SidebarSessionGroups($channelId: ID!, $archived: Boolean, $includeActiveMerged: Boolean) {\n    sessionGroups(\n      channelId: $channelId\n      archived: $archived\n      includeActiveMerged: $includeActiveMerged\n    ) {\n      id\n      name\n      kind\n      slug\n      status\n      visibility\n      owner {\n        id\n        name\n        avatarUrl\n      }\n      prUrl\n      worktreeDeleted\n      archivedAt\n      setupStatus\n      setupError\n      channel {\n        id\n      }\n      repo {\n        id\n        name\n      }\n      branch\n      workdir\n      connection {\n        state\n        runtimeInstanceId\n        runtimeLabel\n        lastError\n        retryCount\n        canRetry\n        canMove\n        autoRetryable\n      }\n      createdAt\n      updatedAt\n      sessions {\n        id\n        name\n        agentStatus\n        sessionStatus\n        tool\n        model\n        reasoningEffort\n        hosting\n        branch\n        workdir\n        prUrl\n        worktreeDeleted\n        sessionGroupId\n        lastUserMessageAt\n        lastMessageAt\n        inputTokens\n        outputTokens\n        cacheReadTokens\n        cacheCreationTokens\n        costUsd\n        connection {\n          state\n          runtimeInstanceId\n          runtimeLabel\n          lastError\n          retryCount\n          canRetry\n          canMove\n          autoRetryable\n        }\n        createdBy {\n          id\n          name\n          avatarUrl\n        }\n        repo {\n          id\n          name\n        }\n        channel {\n          id\n        }\n        createdAt\n        updatedAt\n      }\n    }\n  }\n"];
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

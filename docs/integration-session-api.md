# Integration session API

Trace organization admins issue revocable integration credentials through GraphQL. A credential is
bound to its organization, issuing user, and an explicit list of coding channels. The plaintext
token is returned only once.

```graphql
mutation CreateIntegrationCredential($input: CreateIntegrationCredentialInput!) {
  createIntegrationCredential(input: $input) {
    token
    credential {
      id
      name
      allowedChannelIds
      scopes
    }
  }
}
```

```json
{
  "input": {
    "organizationId": "org-id",
    "name": "Incident bot",
    "allowedChannelIds": ["channel-id"]
  }
}
```

The issuing admin must be an active member of every allowed channel. Send the returned token as a
Bearer credential when creating a session:

```http
POST /api/v1/sessions
Authorization: Bearer trc_int_<secret>
Content-Type: application/json

{
  "prompt": "Investigate failed checkout jobs",
  "channelId": "channel-id",
  "idempotencyKey": "incident-8472"
}
```

API-created sessions use the organization's default cloud agent environment. Reusing the same
idempotency key with the same credential returns the original session instead of creating another.

Read the session's current status with the same credential:

```http
GET /api/v1/sessions/<session-id>
Authorization: Bearer trc_int_<secret>
```

A credential can read only sessions it created. Invalid, expired, or revoked credentials receive
`401`; sessions owned by another credential return `404`.

Revoke a credential through GraphQL:

```graphql
mutation RevokeIntegrationCredential($id: ID!) {
  revokeIntegrationCredential(id: $id) {
    id
    revokedAt
  }
}
```

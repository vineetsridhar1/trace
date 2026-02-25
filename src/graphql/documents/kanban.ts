import { gql } from 'urql';

export const BOARD_QUERY = gql`
  query Board($channelId: ID!) {
    board(channelId: $channelId) {
      id
      channelId
      name
      slug
      color
      sortOrder
      tickets {
        id
        messageId
        columnId
        title
        description
        solutionApproach
        status
        metadata
        sortOrder
        createdAt
        updatedAt
        message {
          id
          branch
          status
          createdAt
          attachments {
            id
            key
            filename
            contentType
            url
          }
        }
      }
    }
  }
`;

export const MOVE_TICKET_MUTATION = gql`
  mutation MoveTicket($ticketId: ID!, $columnId: ID!, $sortOrder: Int) {
    moveTicket(ticketId: $ticketId, columnId: $columnId, sortOrder: $sortOrder) {
      id
      messageId
      columnId
      title
      sortOrder
    }
  }
`;

export const CREATE_COLUMN_MUTATION = gql`
  mutation CreateColumn($channelId: ID!, $name: String!, $slug: String!, $color: String) {
    createColumn(channelId: $channelId, name: $name, slug: $slug, color: $color) {
      id
      channelId
      name
      slug
      color
      sortOrder
    }
  }
`;

export const UPDATE_COLUMN_MUTATION = gql`
  mutation UpdateColumn($columnId: ID!, $name: String, $color: String, $sortOrder: Int) {
    updateColumn(columnId: $columnId, name: $name, color: $color, sortOrder: $sortOrder) {
      id
      name
      color
      sortOrder
    }
  }
`;

export const DELETE_COLUMN_MUTATION = gql`
  mutation DeleteColumn($columnId: ID!) {
    deleteColumn(columnId: $columnId)
  }
`;

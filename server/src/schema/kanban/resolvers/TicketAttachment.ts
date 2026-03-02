import type { TicketAttachmentResolvers } from './../../types.generated';
export const TicketAttachment: TicketAttachmentResolvers = {
    url: ({ url }, _arg, _ctx) => {
                        /* TicketAttachment.url resolver is required because TicketAttachment.url and TicketAttachmentMapper.url are not compatible */
                        return url
                      }
};

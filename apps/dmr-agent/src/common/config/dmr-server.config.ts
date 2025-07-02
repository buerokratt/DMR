import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';

export const DMR_SERVER_CONFIG_TOKEN = Symbol('DMR_SERVER_CONFIG_TOKEN');

const variables = Utils.validateObject({}, {});

export const dmrServerConfig = registerAs(DMR_SERVER_CONFIG_TOKEN, () => variables);

export type DMRServerConfig = ConfigType<typeof dmrServerConfig>;

import Joi from 'joi';

export const validateObject = <Data>(data: Data, rules: Joi.PartialSchemaMap<Data>): Data => {
  const objectSchema = Joi.object<Data>(rules);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { error, value: values } = objectSchema.validate(data, { abortEarly: false });

  if (error) {
    console.error('Config validation error(s):');

    error.details.forEach((detail) => {
      console.error(`- ${detail.message}`);
    });

    throw new Error('Environment variables validation failed.');
  }

  return values;
};

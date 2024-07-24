import {
    ConflictException,
    Injectable,
    NotFoundException,
    InternalServerErrorException,
} from "@nestjs/common"
import {
    CategoryMySqlEntity,
    CertificateMySqlEntity,
    CourseMySqlEntity,
    CourseReviewMySqlEntity,
    CourseTargetMySqlEntity,
    LessonMySqlEntity,
    QuizQuestionAnswerMySqlEntity,
    QuizMySqlEntity,
    ResourceMySqlEntity,
    SectionMySqlEntity,
    QuizQuestionMySqlEntity,
    ProgressMySqlEntity,
    QuizAttemptMySqlEntity,
    AccountMySqlEntity,
    CourseCategoryMySqlEntity,
    ReportCourseMySqlEntity,
    QuizAttemptAnswerMySqlEntity,
    SectionContentMySqlEntity,
    ResourceAttachmentMySqlEntity,
    AccountGradeMySqlEntity,
} from "@database"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository, DataSource, In, MoreThan, Between } from "typeorm"
import { StorageService } from "@global"
import {
    CreateCourseInput,
    CreateSectionInput,
    CreateSectionContentInput,
    UpdateCourseInput,
    CreateCourseTargetInput,
    UpdateCourseTargetInput,
    DeleteCourseTargetInput,
    UpdateLessonInput,
    DeleteSectionInput,
    UpdateSectionInput,
    DeleteResourceInput,
    EnrollCourseInput,
    CreateCategoryInput,
    CreateCourseReviewInput,
    UpdateCourseReviewInput,
    DeleteCourseReviewInput,
    CreateCertificateInput,
    CreateQuizInput,
    UpdateQuizInput,
    CreateQuizAttemptInput,
    FinishQuizAttemptInput,
    DeleteCategoryInput,
    CreateCourseCategoriesInput,
    DeleteCourseCategoryInput,
    CreateCourseReportInput,
    UpdateCourseReportInput,
    ResolveCourseReportInput,
    DeleteSectionContentInput,
    MarkContentAsCompletedInput,
    UpdateResourceInput,
} from "./courses.input"
import { ProcessMpegDashProducer } from "@workers"
import { DeepPartial } from "typeorm"
import {
    ProcessStatus,
    QuizAttemptStatus,
    ReportProcessStatus,
    CourseVerifyStatus,
    VideoType,
    computeDenomination,
    computeRaw,
    existKeyNotUndefined,
    SectionContentType,
    CompleteState,
} from "@common"
import {
    CreateCategoryOutput,
    CreateCertificateOutput,
    CreateCourseCategoriesOutput,
    CreateCourseOutput,
    CreateCourseReportOutput,
    CreateCourseReviewOutput,
    CreateCourseTargetOuput,
    CreateQuizAttemptOutput,
    CreateQuizOutput,
    CreateSectionContentOutput,
    CreateSectionOutput,
    DeleteCategoryOutput,
    DeleteCourseCategoryOutput,
    DeleteCourseReviewOutput,
    DeleteCourseTargetOuput,
    DeleteResourceOuput,
    DeleteSectionContentOutput,
    DeleteSectionOuput,
    EnrollCourseOutput,
    FinishQuizAttemptOutput,
    MarkContentAsCompletedOutput,
    ResolveCourseReportOutput,
    UpdateCourseOutput,
    UpdateCourseReportOutput,
    UpdateCourseReviewOutput,
    UpdateCourseTargetOuput,
    UpdateLessonOutput,
    UpdateQuizOutput,
    UpdateResourceOutput,
    UpdateSectionOuput,
} from "./courses.output"
import { EnrolledInfoEntity } from "../../database/mysql/enrolled-info.entity"
import { getVideoDurationInSeconds } from "get-video-duration"

@Injectable()
export class CoursesService {
    constructor(
    @InjectRepository(CourseMySqlEntity)
    private readonly courseMySqlRepository: Repository<CourseMySqlEntity>,
    @InjectRepository(SectionMySqlEntity)
    private readonly sectionMySqlRepository: Repository<SectionMySqlEntity>,
    @InjectRepository(SectionContentMySqlEntity)
    private readonly sectionContentMySqlRepository: Repository<SectionContentMySqlEntity>,
    @InjectRepository(LessonMySqlEntity)
    private readonly lessonMySqlRepository: Repository<LessonMySqlEntity>,
    @InjectRepository(CourseTargetMySqlEntity)
    private readonly courseTargetMySqlRepository: Repository<CourseTargetMySqlEntity>,
    @InjectRepository(ResourceMySqlEntity)
    private readonly resourceMySqlRepository: Repository<ResourceMySqlEntity>,
    @InjectRepository(ResourceAttachmentMySqlEntity)
    private readonly resourceAttachmentMySqlRepository: Repository<ResourceAttachmentMySqlEntity>,
    @InjectRepository(EnrolledInfoEntity)
    private readonly enrolledInfoMySqlRepository: Repository<EnrolledInfoEntity>,
    @InjectRepository(CategoryMySqlEntity)
    private readonly categoryMySqlRepository: Repository<CategoryMySqlEntity>,
    @InjectRepository(CourseCategoryMySqlEntity)
    private readonly courseCategoryMySqlRepository: Repository<CourseCategoryMySqlEntity>,
    @InjectRepository(CourseReviewMySqlEntity)
    private readonly courseReviewMySqlRepository: Repository<CourseReviewMySqlEntity>,
    @InjectRepository(CertificateMySqlEntity)
    private readonly courseCertificateMySqlEntity: Repository<CertificateMySqlEntity>,
    @InjectRepository(QuizMySqlEntity)
    private readonly quizMySqlRepository: Repository<QuizMySqlEntity>,
    @InjectRepository(QuizQuestionMySqlEntity)
    private readonly quizQuestionMySqlRepository: Repository<QuizQuestionMySqlEntity>,
    @InjectRepository(QuizQuestionAnswerMySqlEntity)
    private readonly quizQuestionAnswerMySqlRepository: Repository<QuizQuestionAnswerMySqlEntity>,
    @InjectRepository(ProgressMySqlEntity)
    private readonly progressMySqlRepository: Repository<ProgressMySqlEntity>,
    @InjectRepository(QuizAttemptMySqlEntity)
    private readonly quizAttemptMySqlRepository: Repository<QuizAttemptMySqlEntity>,
    @InjectRepository(QuizAttemptAnswerMySqlEntity)
    private readonly quizAttemptAnswerMySqlRepository: Repository<QuizAttemptAnswerMySqlEntity>,
    @InjectRepository(AccountMySqlEntity)
    private readonly accountMySqlRepository: Repository<AccountMySqlEntity>,
    @InjectRepository(AccountGradeMySqlEntity)
    private readonly accountGradeMySqlRepository: Repository<AccountGradeMySqlEntity>,
    @InjectRepository(ReportCourseMySqlEntity)
    private readonly reportCourseMySqlRepository: Repository<ReportCourseMySqlEntity>,
    private readonly storageService: StorageService,
    private readonly mpegDashProcessorProducer: ProcessMpegDashProducer,
    private readonly dataSource: DataSource,
    ) {}

    async enrollCourse(input: EnrollCourseInput): Promise<EnrollCourseOutput> {
        const { data, accountId } = input
        const { courseId } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const course = await this.courseMySqlRepository.findOne({
                where: {
                    courseId,
                },
                relations: {
                    sections: {
                        contents: true,
                    },
                },
            })

            if (!course || course.isDeleted) {
                throw new NotFoundException("Course not found or has been deleted")
            }

            const {
                enableDiscount,
                discountPrice,
                price: coursePrice,
                duration,
                sections,
                creatorId,
            } = course

            if (accountId === creatorId) {
                throw new ConflictException("You cannot enroll to your created course.")
            }

            const enrollments = await this.enrolledInfoMySqlRepository.find({
                where: {
                    accountId,
                    courseId,
                },
            })

            const now = new Date()

            const enrolled = enrollments.some(
                (enrollment) => new Date(enrollment.endDate) > now,
            )

            if (enrolled) {
                throw new ConflictException(
                    "This user is already enrolled in that course.",
                )
            }

            const price = computeRaw(enableDiscount ? discountPrice : coursePrice)
            const minimumBalanceRequired = computeDenomination(price)
            const courseCreatorShares = computeDenomination(price / BigInt(2))

            const { balance } = await this.accountMySqlRepository.findOneBy({
                accountId,
            })

            if (balance < minimumBalanceRequired) {
                throw new ConflictException(
                    "Your account does not have sufficient balance to enroll in this course.",
                )
            }

            await this.accountMySqlRepository.update(accountId, {
                balance: balance - minimumBalanceRequired,
            })
            await this.accountMySqlRepository.increment(
                { accountId: creatorId },
                "balance",
                courseCreatorShares,
            )

            const enrollDate = new Date()
            const endDate = new Date(enrollDate)
            endDate.setMonth(endDate.getMonth() + duration)

            const { enrolledInfoId } = await this.enrolledInfoMySqlRepository.save({
                courseId,
                accountId,
                enrolled: true,
                priceAtEnrolled: minimumBalanceRequired,
                endDate,
            })

            const gradedSectionIds = sections
                .flatMap((section) =>
                    section.contents.some(
                        (content) => content.type === SectionContentType.Quiz,
                    )
                        ? [section.sectionId]
                        : [],
                )
                .filter((sectionId) => sectionId !== undefined)

            const accountGrades = gradedSectionIds.map((sectionId) => ({
                enrolledInfoId,
                sectionId,
            }))

            await this.accountGradeMySqlRepository.save(accountGrades)

            await queryRunner.commitTransaction()

            return {
                message: "Enrolled successfully",
                others: { enrolledInfoId },
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async createCourse(input: CreateCourseInput): Promise<CreateCourseOutput> {
        const { accountId } = input
        const created = await this.courseMySqlRepository.save({
            creatorId: accountId,
        })

        if (!created) {
            throw new ConflictException("Error whil creating new course")
        }

        return {
            message: "Course " + created.title + "created Successfully",
            others: { courseId: created.courseId },
        }
    }

    async updateCourse(input: UpdateCourseInput): Promise<UpdateCourseOutput> {
        const { data, files } = input
        const {
            thumbnailIndex,
            previewVideoIndex,
            courseId,
            description,
            price,
            discountPrice,
            enableDiscount,
            title,
            receivedWalletAddress,
            categoryIds,
        } = data
        const course: DeepPartial<CourseMySqlEntity> = {
            courseId,
            description,
            title,
            price,
            discountPrice,
            enableDiscount,
            receivedWalletAddress,
        }

        const promises: Array<Promise<void>> = []

        const { previewVideoId, thumbnailId } =
      await this.courseMySqlRepository.findOneBy({ courseId })

        if (Number.isInteger(previewVideoIndex)) {
            const promise = async () => {
                const file = files.at(previewVideoIndex)
                if (previewVideoId) {
                    await this.storageService.update(thumbnailId, {
                        rootFile: file,
                    })
                } else {
                    const { assetId } = await this.storageService.upload({
                        rootFile: file,
                    })
                    course.previewVideoId = assetId
                }
            }
            promises.push(promise())
        }

        if (Number.isInteger(thumbnailIndex)) {
            const promise = async () => {
                const file = files.at(thumbnailIndex)
                if (thumbnailId) {
                    await this.storageService.update(thumbnailId, {
                        rootFile: file,
                    })
                } else {
                    const { assetId } = await this.storageService.upload({
                        rootFile: file,
                    })
                    course.thumbnailId = assetId
                }
            }
            promises.push(promise())
        }
        await Promise.all(promises)

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            if (categoryIds?.length) {
                await this.courseCategoryMySqlRepository.delete({ courseId })
                const newCategories = categoryIds?.map((categoryId) => ({
                    categoryId,
                    courseId,
                }))
                await this.courseCategoryMySqlRepository.save(newCategories)
            }

            if (existKeyNotUndefined(course)) {
                course.verifyStatus = CourseVerifyStatus.Pending
                await this.courseMySqlRepository.save(course)
            }

            await queryRunner.commitTransaction()

            return { message: "Course Updated Successfully" }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async createCourseReview(
        input: CreateCourseReviewInput,
    ): Promise<CreateCourseReviewOutput> {
        const { data, accountId } = input
        const { courseId, content, rating } = data

        const course = await this.courseMySqlRepository.findOneBy({ courseId })

        if (!course) {
            throw new NotFoundException("Course not found")
        }

        if (accountId === course.creatorId) {
            throw new ConflictException(
                "You cannot write a review on your created course.",
            )
        }

        const enrolled = await this.enrolledInfoMySqlRepository.findOneBy({
            accountId,
        })

        if (!enrolled) {
            throw new ConflictException(
                "You must have been enrolled to the course to post a review",
            )
        }

        const reviewed = await this.courseReviewMySqlRepository.findOne({
            where: { accountId, courseId },
        })

        if (reviewed) {
            throw new ConflictException(
                "You have already has a review on this course",
            )
        }

        try {
            const result = await this.courseReviewMySqlRepository.save({
                courseId,
                accountId,
                content,
                rating,
            })

            if (result) {
                return { message: "Review Created Successfully" }
            }
        } catch (error) {
            throw new InternalServerErrorException("Failed due to system error")
        }
    }

    async updateCourseReview(
        input: UpdateCourseReviewInput,
    ): Promise<UpdateCourseReviewOutput> {
        const { data, accountId } = input
        const { content, rating, courseReviewId } = data

        const reviewed = await this.courseReviewMySqlRepository.findOne({
            where: { courseReviewId, accountId },
        })
        if (!reviewed) {
            throw new NotFoundException(
                "This review is not found or not owned by sender.",
            )
        }

        if (content || rating) {
            await this.courseReviewMySqlRepository.update(courseReviewId, {
                content,
                rating,
            })
            return { message: "Review Updated Successfully" }
        }
        return { message: "No update were made." }
    }

    async deleteCourseReview(
        input: DeleteCourseReviewInput,
    ): Promise<DeleteCourseReviewOutput> {
        const { data, accountId } = input
        const { courseReviewId } = data

        const reviewed = await this.courseReviewMySqlRepository.findOne({
            where: {
                courseReviewId,
                accountId,
            },
        })

        if (!reviewed) {
            // nó chỉ quăng lỗi khi mà cái review không tìm thấy hoặc nó không thuộc về người đó
            throw new NotFoundException(
                "This review is not found or not owned by sender.",
            )
        }

        await this.courseReviewMySqlRepository.delete({ courseReviewId })

        return { message: "Review deleted successfully" }
    }

    async createSection(input: CreateSectionInput): Promise<CreateSectionOutput> {
        const { data } = input
        const { courseId, title, position, isLocked } = data

        const course = await this.courseMySqlRepository.findOneBy({
            courseId,
        })
        if (!course) throw new NotFoundException("Course not found.")
        const created = await this.sectionMySqlRepository.save({
            courseId,
            title,
            position,
            isLocked: position === 0 ? false : isLocked,
        })

        return {
            message: `A section with id ${created.sectionId} has been created successfully.`,
        }
    }

    async createSectionContent(
        input: CreateSectionContentInput,
    ): Promise<CreateSectionContentOutput> {
        const { sectionId, type } = input.data

        const sectionContents = await this.sectionContentMySqlRepository.find({
            where: {
                sectionId,
            },
        })

        const position = sectionContents.reduce((max, current) => {
            return current.position > max ? current.position : max
        }, 0)

        const { sectionContentId } = await this.sectionContentMySqlRepository.save({
            type,
            sectionId,
            title: "Untitled",
            position: position + 1,
        })

        switch (type) {
        case SectionContentType.Lesson: {
            const lesson = await this.lessonMySqlRepository.save({
                lessonId: sectionContentId,
                description: "Write some description here.",
            })
            await this.sectionContentMySqlRepository.update(
                {
                    sectionContentId,
                },
                {
                    lessonId: lesson.lessonId,
                    lesson,
                },
            )
            break
        }
        case SectionContentType.Quiz: {
            const quiz = await this.quizMySqlRepository.save({
                quizId: sectionContentId,
            })
            await this.sectionContentMySqlRepository.update(
                {
                    sectionContentId,
                },
                {
                    quizId: quiz.quizId,
                    quiz,
                },
            )
            break
        }
        case SectionContentType.Resource: {
            const resource = await this.resourceMySqlRepository.save({
                resourceId: sectionContentId,
                position,
            })
            await this.sectionContentMySqlRepository.update(sectionContentId, {
                resourceId: resource.resourceId,
                resource,
            })
            break
        }
        }

        // const now = new Date()

        // const { enrolledInfoId } = await this.enrolledInfoMySqlRepository.findOne({
        //     where:{
        //         endDate: MoreThan(now)
        //     }
        // })

        // await this.progressMySqlRepository.save({
        //     enrolledInfoId,
        //     sectionContentId: newLesson.sectionContentId
        // })

        // await this.sectionContentMySqlRepository.update({ sectionContentId: newLesson.sectionContentId }, { lessonId: created.lessonId })
        return {
            message: "Content creeated successfully.",
        }
    }

    async updateLesson(input: UpdateLessonInput): Promise<UpdateLessonOutput> {
        const { data, files } = input
        const { lessonId, description, lessonVideoIndex, thumbnailIndex } = data

        const { thumbnailId, lessonVideoId } =
      await this.lessonMySqlRepository.findOneBy({ lessonId })

        const promises: Array<Promise<void>> = []

        const lesson: DeepPartial<LessonMySqlEntity> = { description }

        if (Number.isInteger(lessonVideoIndex)) {
            const promise = async () => {
                const file = files.at(lessonVideoIndex)

                await this.lessonMySqlRepository.update(
                    { lessonId },
                    {
                        processStatus: ProcessStatus.Pending,
                    },
                )

                const queryAtStart = this.lessonMySqlRepository
                    .createQueryBuilder()
                    .update()
                    .set({
                        processStatus: ProcessStatus.Processing,
                        videoType: VideoType.MP4,
                    })
                    .where({
                        lessonId,
                    })
                    .getQueryAndParameters()

                const queryAtEnd = this.lessonMySqlRepository
                    .createQueryBuilder()
                    .update()
                    .set({
                        processStatus: ProcessStatus.Completed,
                        videoType: VideoType.DASH,
                    })
                    .andWhere({
                        lessonId,
                    })
                    .getQueryAndParameters()

                let assetId: string
                if (lessonVideoId) {
                    await this.storageService.update(lessonVideoId, {
                        rootFile: file,
                    })
                    assetId = lessonVideoId
                } else {
                    const { assetId: createdAssetId } = await this.storageService.upload({
                        rootFile: file,
                    })
                    lesson.lessonVideoId = createdAssetId
                    assetId = createdAssetId
                }

                const readStream = await this.storageService.createReadStream(assetId)
                const durationInSeconds = await getVideoDurationInSeconds(readStream)

                await this.lessonMySqlRepository.update(lessonId, {
                    durationInSeconds,
                })

                await this.mpegDashProcessorProducer.add({
                    assetId,
                    file,
                    callbackQueries: {
                        queryAtStart,
                        queryAtEnd,
                    },
                })
            }
            promises.push(promise())
        }

        if (Number.isInteger(thumbnailIndex)) {
            const promise = async () => {
                const file = files.at(thumbnailIndex)
                if (thumbnailId) {
                    await this.storageService.update(thumbnailId, {
                        rootFile: file,
                    })
                } else {
                    const { assetId } = await this.storageService.upload({
                        rootFile: file,
                    })
                    lesson.thumbnailId = assetId
                }
            }
            promises.push(promise())
        }
        await Promise.all(promises)

        if (existKeyNotUndefined(lesson))
            await this.lessonMySqlRepository.update(lessonId, lesson)
        return {
            message: `A lesson with id ${lessonId} has been updated successfully.`,
        }
    }

    async deleteSectionContent(
        input: DeleteSectionContentInput,
    ): Promise<DeleteSectionContentOutput> {
        const { data } = input
        const { sectionContentId } = data

        const sectionContent = await this.sectionContentMySqlRepository.findOneBy({
            sectionContentId,
        })

        if (!sectionContent) {
            throw new NotFoundException("Content not found")
        }

        switch (sectionContent.type) {
        case SectionContentType.Lesson: {
            const lesson = await this.lessonMySqlRepository.findOneBy({
                lessonId: sectionContentId,
            })
            if (lesson) {
                if (lesson.thumbnailId || lesson.lessonVideoId) {
                    const lessonMedia = [lesson.thumbnailId, lesson.lessonVideoId]
                    await this.storageService.delete(...lessonMedia)
                }
            }
            break
        }
        case SectionContentType.Quiz: {
            break
        }
        case SectionContentType.Resource: {
            const attachments = await this.resourceAttachmentMySqlRepository.findBy(
                { resourceId: sectionContentId },
            )
            if (attachments) {
                const mediaIds = attachments.map(({ fileId }) => fileId)
                await this.storageService.delete(...mediaIds)
            }
            break
        }
        default:
            break
        }

        await this.sectionContentMySqlRepository.delete({ sectionContentId })
        return {
            message: "Content has been deleted successfully.",
        }
    }

    async createCourseTarget(
        input: CreateCourseTargetInput,
    ): Promise<CreateCourseTargetOuput> {
        const { data } = input
        const { content, courseId } = data
        const maxResult = await this.courseTargetMySqlRepository
            .createQueryBuilder()
            .select("MAX(position)", "count")
            .getRawOne()
        const max = maxResult.count as number

        const created = await this.courseTargetMySqlRepository.save({
            courseId,
            content,
            position: max + 1,
        })
        if (created)
            return {
                message: `A course target with id ${created.courseTargetId} has been created successfully.`,
            }
    }

    async updateCourseTarget(
        input: UpdateCourseTargetInput,
    ): Promise<UpdateCourseTargetOuput> {
        const { data } = input
        const { content, courseTargetId } = data
        await this.courseTargetMySqlRepository.update(courseTargetId, {
            content,
        })
        return {
            message: `A course target with id ${courseTargetId} has been updated successfully.`,
        }
    }

    async deleteCourseTarget(
        input: DeleteCourseTargetInput,
    ): Promise<DeleteCourseTargetOuput> {
        const { data } = input
        const { courseTargetId } = data
        await this.courseTargetMySqlRepository.delete({ courseTargetId })
        return {
            message: `A course target with id ${courseTargetId} has been deleted successfully.`,
        }
    }

    async updateResource(
        input: UpdateResourceInput,
    ): Promise<UpdateResourceOutput> {
        const { files, data } = input
        const { resourceId, description, resourceAttachments } = data

        const resource: DeepPartial<ResourceMySqlEntity> = {
            resourceId,
            description,
            attachments: [],
        }

        if (files) {
            const promises: Array<Promise<void>> = []
            let filePosition = 0
            for (const attachment of resourceAttachments) {
                const { fileIndex } = attachment

                const position = filePosition
                const promise = async () => {
                    const file = files.at(fileIndex)
                    const { assetId } = await this.storageService.upload({
                        rootFile: file,
                    })
                    resource.attachments.push({
                        resourceId,
                        position,
                        name: file.originalname,
                        fileId: assetId,
                    } as ResourceAttachmentMySqlEntity)
                }
                filePosition++
                promises.push(promise())
            }
            await Promise.all(promises)
        }
        console.log(resource.attachments)
        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const deletedResourceAttachments =
        await this.resourceAttachmentMySqlRepository.findBy({
            resourceId,
        })
            await this.resourceAttachmentMySqlRepository.delete({ resourceId })
            await this.resourceMySqlRepository.save(resource)

            await queryRunner.commitTransaction()

            const fileIds = deletedResourceAttachments.map(
                (deletedResourceAttachments) => deletedResourceAttachments.fileId,
            )

            await this.storageService.delete(...fileIds)

            return {
                message: "Resource updated sucessfully",
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
        } finally {
            await queryRunner.release()
        }
    }

    async updateSection(input: UpdateSectionInput): Promise<UpdateSectionOuput> {
        const { data } = input
        const { sectionId, title, position } = data
        await this.sectionMySqlRepository.update(sectionId, {
            title,
            position,
        })
        return {
            message: `A section with id  ${sectionId} has been updated successfully.`,
        }
    }

    async deleteSection(input: DeleteSectionInput): Promise<DeleteSectionOuput> {
        const { data } = input
        const { sectionId } = data
        await this.sectionMySqlRepository.delete({ sectionId })
        return {
            message: `A section with id ${sectionId} has been deleted successfully.`,
        }
    }

    async deleteResourceAttachment(
        input: DeleteResourceInput,
    ): Promise<DeleteResourceOuput> {
        const { data } = input
        const { resourceAttachmentId } = data

        const attachment = await this.resourceAttachmentMySqlRepository.findOneBy({
            resourceAttachmentId,
        })

        if (!attachment) {
            throw new NotFoundException("Resource not found")
        }

        await this.storageService.delete(attachment.fileId)
        await this.resourceAttachmentMySqlRepository.delete({
            resourceAttachmentId,
        })

        return {
            message: "Attachment has been deleted successfully.",
        }
    }

    //apis only
    async createCategory(
        input: CreateCategoryInput,
    ): Promise<CreateCategoryOutput> {
        const { data, files } = input
        const { name, categoryParentIds, categoryIds, imageIndex } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            let imageId: string | undefined

            if (Number.isInteger(imageIndex)) {
                const { assetId } = await this.storageService.upload({
                    rootFile: files.at(imageIndex),
                })
                imageId = assetId
            }

            let level = 0

            let parentLevels: number[] = []
            if (categoryParentIds && categoryParentIds.length > 0) {
                const parentCategories = await this.categoryMySqlRepository.find({
                    where: {
                        categoryId: In(categoryParentIds),
                    },
                })
                parentLevels = parentCategories.map((category) => category.level)

                if (new Set(parentLevels).size !== 1) {
                    throw new ConflictException(
                        "All parent categories must be at the same level",
                    )
                }
                level = parentLevels[0] + 1
            }

            let childLevels: number[] = []
            if (categoryIds && categoryIds.length > 0) {
                const childCategories = await this.categoryMySqlRepository.find({
                    where: {
                        categoryId: In(categoryIds),
                    },
                })
                childLevels = childCategories.map((category) => category.level)

                if (new Set(childLevels).size !== 1) {
                    throw new ConflictException(
                        "All child categories must be at the same level",
                    )
                }

                if (!categoryParentIds) {
                    if (childLevels[0] !== 1) {
                        throw new ConflictException("Child categories must be at level 1")
                    }
                    level = 0
                }
            }

            if (categoryParentIds && categoryIds) {
                if (childLevels[0] - parentLevels[0] !== 2) {
                    throw new ConflictException(
                        "The level difference between child and parent categories must be 2",
                    )
                }
                const found = await this.categoryMySqlRepository.find({
                    where: {
                        level,
                    },
                })

                if (found.some((categoryName) => categoryName.name === name)) {
                    throw new ConflictException(
                        `There's already existed category named ${name} at this level`,
                    )
                }
            }

            const createdCategory = await this.categoryMySqlRepository.save({
                name,
                imageId,
                level,
                categoryParentRelations: categoryIds
                    ? categoryIds.map((categoryId) => ({
                        categoryId,
                    }))
                    : [],
                categoryRelations: categoryParentIds
                    ? categoryParentIds.map((categoryParentId) => ({
                        categoryParentId,
                    }))
                    : [],
            })

            await queryRunner.commitTransaction()

            return {
                message: `Category ${createdCategory.name} has been created successfully`,
                others: { categoryId: createdCategory.categoryId },
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async deleteCategory(
        input: DeleteCategoryInput,
    ): Promise<DeleteCategoryOutput> {
        const { data } = input
        const { categoryId } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            await this.categoryMySqlRepository.delete({
                categoryId,
            })

            await queryRunner.commitTransaction()
            return {
                message: `Category ${categoryId} has been deleted successfully`,
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async createCourseCategories(
        input: CreateCourseCategoriesInput,
    ): Promise<CreateCourseCategoriesOutput> {
        const { data } = input
        const { courseId, categoryIds } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const courseCategories = categoryIds.map((categoryId) => ({
                courseId,
                categoryId,
            }))

            //await this.courseCategoryMySqlRepository.save(courseCategories);
            await queryRunner.manager.save(
                CourseCategoryMySqlEntity,
                courseCategories,
            )

            return {
                message: "Course Category has been created successfully",
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async deleteCourseCategory(
        input: DeleteCourseCategoryInput,
    ): Promise<DeleteCourseCategoryOutput> {
        const { data } = input
        const { categoryId, courseId } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const found = await this.courseCategoryMySqlRepository.findOne({
                where: {
                    courseId,
                    categoryId,
                },
            })

            if (!found)
                throw new NotFoundException(
                    "No specified course found in this category",
                )

            await this.courseCategoryMySqlRepository.delete({
                categoryId,
                courseId,
            })

            await queryRunner.commitTransaction()
            return {
                message: "Course has been deleted from category successfully",
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async createCourseCertificate(
        input: CreateCertificateInput,
    ): Promise<CreateCertificateOutput> {
        const { accountId, data } = input
        const { courseId } = data

        const enrollments = await this.enrolledInfoMySqlRepository.find({
            where: {
                accountId,
                courseId,
            },
        })

        const now = new Date()

        const activeEnrollment = enrollments.some(
            (enrollment) => new Date(enrollment.endDate) > now,
        )

        if (activeEnrollment) {
            const found = await this.courseCertificateMySqlEntity.findOne({
                where: {
                    accountId,
                    courseId,
                },
            })

            if (found) {
                throw new ConflictException(
                    "You have already get certificate of this course",
                )
            }
        } // Báo lỗi người dùng không có lượt đăng kí khóa học nào còn hạn sử dụng
        else
            throw new NotFoundException(
                "You do not have any active enrollments in this course that remain valid. ",
            )

        const achievedDate = new Date()
        const expireDate = new Date(achievedDate)
        expireDate.setDate(expireDate.getDate() + 90)

        const { certificateId } = await this.courseCertificateMySqlEntity.save({
            accountId,
            courseId,
            achievedDate,
            expireDate,
        })

        return {
            message: "Certificate Created Successfully",
            others: {
                certificateId,
            },
        }
    }

    async createQuiz(input: CreateQuizInput): Promise<CreateQuizOutput> {
        const { data, accountId } = input
        const { sectionId, quizQuestions, title, timeLimit } = data
        //Tìm quiz trong db, nếu chưa có thì tạo mới, nếu có thì chỉ thêm question và answer
        const course = await this.courseMySqlRepository.findOne({
            where: {
                creatorId: accountId,
            },
        })

        if (accountId !== course.creatorId) {
            throw new ConflictException("You are not the creator of the course")
        }

        const { sectionContentId } = await this.sectionContentMySqlRepository.save({
            sectionId,
            title,
            type: SectionContentType.Quiz,
        })

        const { quizId } = await this.quizMySqlRepository.save({
            quizId: sectionContentId,
            timeLimit,
        })

        await this.sectionContentMySqlRepository.update(sectionContentId, {
            quizId,
        })

        if (!quizQuestions || quizQuestions.length === 0) {
            throw new ConflictException(
                "Please provide more than 1 question for the quiz",
            )
        }

        const questionPromises: Array<Promise<void>> = []

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            for (const questions of quizQuestions) {
                const { answers, question, point } = questions

                const quizQuestion: DeepPartial<QuizQuestionMySqlEntity> = {
                    quizId,
                    question,
                    point,
                }

                const { quizQuestionId } =
          await this.quizQuestionMySqlRepository.save(quizQuestion)

                if (!answers || answers.length < 2) {
                    throw new ConflictException("Question must have at least 2 answers")
                }

                const questionAnswers = answers.map(({ content, isCorrect }) => ({
                    quizQuestionId,
                    content,
                    isCorrect,
                }))

                const hasCorrectAnswer = questionAnswers.some(
                    (answer) => answer.isCorrect,
                )

                if (!hasCorrectAnswer) {
                    throw new ConflictException(
                        "Quiz must have at least 1 correct answer",
                    )
                }

                await this.quizQuestionAnswerMySqlRepository.save(questionAnswers)

                questionPromises.push()
            }
            await Promise.all(questionPromises)

            const now = new Date()

            const { enrolledInfoId } = await this.enrolledInfoMySqlRepository.findOne(
                {
                    where: {
                        endDate: MoreThan(now),
                    },
                },
            )

            await this.accountGradeMySqlRepository.save({
                enrolledInfoId,
                sectionId,
            })

            await queryRunner.commitTransaction()
            return {
                message: `A quiz with id ${quizId} has been created successfully.`,
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async updateQuiz(input: UpdateQuizInput): Promise<UpdateQuizOutput> {
        const { data } = input
        const {
            quizId,
            timeLimit,
            newQuestions,
            quizQuestionIdsToDelete,
            quizQuestionIdsToUpdate,
        } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()
        try {
            if (timeLimit) {
                await this.quizMySqlRepository.update(quizId, { timeLimit })
            }

            if (newQuestions) {
                for (const questions of newQuestions) {
                    const { answers, question, point } = questions
                    const quizQuestion: DeepPartial<QuizQuestionMySqlEntity> = {
                        quizId,
                        question,
                        point,
                    }

                    const savedQuizQuestion = await queryRunner.manager.save(
                        QuizQuestionMySqlEntity,
                        quizQuestion,
                    )
                    const { quizQuestionId } = savedQuizQuestion

                    const questionAnswers = answers.map(({ content, isCorrect }) => ({
                        quizQuestionId,
                        content,
                        isCorrect,
                    }))

                    if (!answers || answers.length < 2) {
                        throw new ConflictException("Question must have at least 2 answers")
                    }

                    const hasCorrectAnswer = questionAnswers.some(
                        (answer) => answer.isCorrect,
                    )
                    if (!hasCorrectAnswer) {
                        throw new ConflictException(
                            "Quiz must have at least 1 correct answer",
                        )
                    }

                    await queryRunner.manager.save(
                        QuizQuestionAnswerMySqlEntity,
                        questionAnswers,
                    )
                }
            }
            if (quizQuestionIdsToDelete) {
                const numberOfQuizQuestions = await queryRunner.manager
                    .createQueryBuilder()
                    .select("COUNT(*)", "count")
                    .from(QuizQuestionMySqlEntity, "quiz-question")
                    .where("quiz-question.quizId = :quizId", { quizId })
                    .getRawOne()

                if (numberOfQuizQuestions.count - quizQuestionIdsToDelete.length < 1) {
                    throw new ConflictException("Quiz must have at least 1 question")
                }

                await queryRunner.manager.delete(QuizQuestionMySqlEntity, {
                    quizQuestionId: In(quizQuestionIdsToDelete),
                })
            }

            if (quizQuestionIdsToUpdate) {
                for (const updateQuestion of quizQuestionIdsToUpdate) {
                    const {
                        quizQuestionId,
                        question,
                        point,
                        quizAnswerIdsToUpdate,
                        quizAnswerIdsToDelete,
                        newQuizQuestionAnswer,
                    } = updateQuestion

                    const found = await this.quizQuestionMySqlRepository.findOne({
                        where: {
                            quizQuestionId,
                            quizId,
                        },
                    })

                    if (!found) {
                        throw new NotFoundException(
                            "Question not found or not belong to this quiz",
                        )
                    }

                    const currentQuestion: DeepPartial<QuizQuestionMySqlEntity> = {
                        quizQuestionId,
                        question,
                        point,
                    }

                    if (newQuizQuestionAnswer) {
                        const newQuizAnswers = newQuizQuestionAnswer.map(
                            ({ content, isCorrect }) => ({
                                quizQuestionId,
                                content,
                                isCorrect,
                            }),
                        )

                        await this.quizQuestionAnswerMySqlRepository.save(newQuizAnswers)
                    }

                    if (quizAnswerIdsToUpdate) {
                        const updateAnswers = []
                        for (const answer of quizAnswerIdsToUpdate) {
                            updateAnswers.push({
                                quizQuestionAnswerId: answer.quizQuestionAnswerId,
                                content: answer.content,
                                isCorrect: answer.isCorrect,
                            })
                        }

                        await queryRunner.manager.save(
                            QuizQuestionAnswerMySqlEntity,
                            updateAnswers,
                        )
                    }

                    if (quizAnswerIdsToDelete) {
                        await queryRunner.manager.delete(QuizQuestionAnswerMySqlEntity, {
                            quizQuestionAnswerId: In(quizAnswerIdsToDelete),
                        })
                    }

                    const numberOfCorrectQuizQuestionAnswersResult =
            await queryRunner.manager
                .createQueryBuilder()
                .select("COUNT(*)", "count")
                .from(QuizQuestionAnswerMySqlEntity, "quiz-question-answer")
                .where("quiz-question-answer.quizQuestionId = :quizQuestionId", {
                    quizQuestionId,
                })
                .andWhere("quiz-question-answer.isCorrect = :isCorrect", {
                    isCorrect: true,
                })
                .getRawOne()
                    const numberOfQuizQuestionAnswersResult = await queryRunner.manager
                        .createQueryBuilder()
                        .select("COUNT(*)", "count")
                        .from(QuizQuestionAnswerMySqlEntity, "quiz-question-answer")
                        .where("quiz-question-answer.quizQuestionId = :quizQuestionId", {
                            quizQuestionId,
                        })
                        .getRawOne()

                    if (numberOfQuizQuestionAnswersResult.count < 2) {
                        throw new ConflictException("Question must have at least 2 answers")
                    }

                    if (numberOfCorrectQuizQuestionAnswersResult.count < 1) {
                        throw new ConflictException(
                            "Quiz must have at least 1 correct answer",
                        )
                    }

                    await this.quizQuestionMySqlRepository.save(currentQuestion)
                }
            }
            await queryRunner.commitTransaction()
            return { message: "Quiz Updated Successfully" }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async markContentAsCompleted(
        input: MarkContentAsCompletedInput,
    ): Promise<MarkContentAsCompletedOutput> {
        const { data, accountId } = input
        const { sectionContentId } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const progress = await this.progressMySqlRepository.findOne({
                where: { sectionContentId },
                relations: { enrolledInfo: true },
            })

            if (!progress) {
                throw new NotFoundException("Content not found")
            }

            const { enrolledInfo } = progress

            if (!enrolledInfo || enrolledInfo.accountId !== accountId) {
                throw new NotFoundException(
                    "You haven't enrolled to course that has this content",
                )
            }

            const now = new Date()

            if (now > enrolledInfo.endDate)
                throw new ConflictException("This Course has expired")

            await this.progressMySqlRepository.update(
                { sectionContentId },
                { completeState: CompleteState.Completed },
            )

            await queryRunner.commitTransaction()

            return { message: "You have completed this content" }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async createQuizAttempt(
        input: CreateQuizAttemptInput,
    ): Promise<CreateQuizAttemptOutput> {
        const { data, accountId } = input
        const { quizId } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const course = await this.courseMySqlRepository.findOne({
                where: {
                    sections: {
                        contents: {
                            type: SectionContentType.Quiz,
                            quizId,
                        },
                    },
                },
            })

            const enrollments = await this.enrolledInfoMySqlRepository.findBy({
                courseId: course.courseId,
            })
            const now = new Date()
            const activeEnrollment = enrollments.filter(
                (date) => new Date(date.endDate) < now,
            )

            if (!activeEnrollment) {
                throw new ConflictException(
                    "Your enrollment(s) in this course have been expired",
                )
            }

            const doing = await this.quizAttemptMySqlRepository.findOne({
                where: {
                    quizId,
                    accountId,
                    attemptStatus: QuizAttemptStatus.Started,
                },
            })

            if (doing) {
                throw new ConflictException("You havent completed the last attempt.")
            }

            const startOfDay = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                0,
                0,
                0,
            )
            const endOfDay = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                23,
                59,
                59,
            )

            const currentDateAttempts = await this.quizAttemptMySqlRepository.find({
                where: {
                    accountId,
                    quizId,
                    createdAt: Between(startOfDay, endOfDay),
                },
                order: {
                    createdAt: "ASC",
                },
            })

            if (currentDateAttempts.length >= 3) {
                const thirdAttemptTimestamps = currentDateAttempts
                    .filter((_, index) => (index + 1) % 3 === 0)
                    .map((attempt) => attempt.createdAt)

                if (thirdAttemptTimestamps.length > 0) {
                    const latestThirdAttemptTimestamp =
            thirdAttemptTimestamps[thirdAttemptTimestamps.length - 1]
                    const unlockTime = new Date(latestThirdAttemptTimestamp)
                    unlockTime.setHours(unlockTime.getHours() + 8)

                    if (now < unlockTime) {
                        throw new ConflictException(
                            "You can only create a new attempt 8 hours after your last 3rd attempt.",
                        )
                    }
                }
            }

            const { quizAttemptId } = await this.quizAttemptMySqlRepository.save({
                accountId,
                quizId,
            })

            return {
                message: "Attempt Started Successfully!",
                others: {
                    quizAttemptId,
                },
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    async finishQuizAttempt(
        input: FinishQuizAttemptInput,
    ): Promise<FinishQuizAttemptOutput> {
        const { data } = input
        const { quizAttemptId, quizQuestionAnswerIds, timeTaken } = data

        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        try {
            const attempt = await this.quizAttemptMySqlRepository.findOneBy({
                quizAttemptId,
            })

            if (!attempt) {
                throw new NotFoundException("Attempt not found")
            }

            if (attempt.attemptStatus === QuizAttemptStatus.Ended) {
                throw new NotFoundException("Attempt already ended")
            }

            await this.quizAttemptMySqlRepository.update(quizAttemptId, {
                attemptStatus: QuizAttemptStatus.Ended,
            })
            const { quizId } = await this.quizAttemptMySqlRepository.findOneBy({
                quizAttemptId,
            })

            const quiz = await this.quizMySqlRepository.findOne({
                where: {
                    quizId,
                },
                relations: {
                    questions: {
                        answers: true,
                    },
                },
            })

            if (!quiz) {
                throw new NotFoundException("Quiz not found")
            }

            const questionAnswers = await this.quizQuestionAnswerMySqlRepository.find(
                {
                    where: {
                        quizQuestionAnswerId: In(quizQuestionAnswerIds),
                    },
                },
            )

            const questionsWithCorrectAnswers = quiz.questions.map((question) => {
                const correctAnswers = question.answers
                    .filter((answer) => answer.isCorrect)
                    .map((answer) => answer.quizQuestionAnswerId)
                return {
                    quizQuestionId: question.quizQuestionId,
                    point: question.point,
                    correctAnswers: correctAnswers,
                }
            })

            let totalPoints = 0
            let maxPoints = 0

            const questionAnswerCountMap: { [key: string]: number } = {}

            quizQuestionAnswerIds.forEach((answerId) => {
                questionsWithCorrectAnswers.forEach((question) => {
                    if (question.correctAnswers.includes(answerId)) {
                        if (!questionAnswerCountMap[question.quizQuestionId]) {
                            questionAnswerCountMap[question.quizQuestionId] = 0
                        }
                        questionAnswerCountMap[question.quizQuestionId]++
                    }
                })
            })

            questionsWithCorrectAnswers.forEach((question) => {
                const correctAnswerCount = question.correctAnswers.length
                const accountAnswerCount =
          questionAnswerCountMap[question.quizQuestionId] || 0
                maxPoints += Number(question.point)
                if (accountAnswerCount === correctAnswerCount) {
                    totalPoints += Number(question.point)
                }
            })
            const score = (totalPoints / maxPoints) * 10

            await this.quizAttemptMySqlRepository.save({
                quizAttemptId,
                score,
                questionAnswers,
                timeTaken,
            })

            const accountAnswers = quizQuestionAnswerIds.map(
                (quizQuestionAnswerId) => ({
                    quizAttemptId,
                    quizQuestionAnswerId,
                }),
            )

            await this.quizAttemptAnswerMySqlRepository.save(accountAnswers)

            await queryRunner.commitTransaction()

            return {
                message: "Quiz ended successfully!",
                others: {
                    score,
                },
            }
        } catch (ex) {
            await queryRunner.rollbackTransaction()
            throw ex
        } finally {
            await queryRunner.release()
        }
    }

    // async giftCourse(input: GiftCourseInput): Promise<GiftCourseOutput> {
    //     const { data, accountId } = input
    //     const { courseId, receiveAccountEmail } = data

    //     const queryRunner = this.dataSource.createQueryRunner()
    //     await queryRunner.connect()
    //     await queryRunner.startTransaction()
    //     try {
    //         const receiveAccount = await this.accountMySqlRepository.findOneBy({
    //             email: receiveAccountEmail,
    //         })

    //         if (!receiveAccount || receiveAccount.verified === false) {
    //             throw new NotFoundException(
    //                 "Receive account not found or they aren't verified",
    //             )
    //         }

    //         const enrolled = await this.enrolledInfoMySqlRepository.findOne({
    //             where: {
    //                 accountId: receiveAccount.accountId,
    //                 courseId,
    //             },
    //         })

    //         if (enrolled) {
    //             throw new ConflictException(
    //                 "This account has already enrolled to this course",
    //             )
    //         }

    //         const {
    //             enableDiscount,
    //             discountPrice,
    //             price: coursePrice,
    //             duration,
    //             sections,
    //             title,
    //             creatorId
    //         } = await this.courseMySqlRepository.findOne({
    //             where: {
    //                 courseId,
    //             },
    //             relations: {
    //                 sections: {
    //                     lessons: true,
    //                 },
    //             },
    //         })
    //         const { balance } = await this.accountMySqlRepository.findOneBy({ accountId })

    //         const price = computeRaw(enableDiscount ? discountPrice : coursePrice)
    //         const minimumBalanceRequired = computeDenomination(price)
    //         const courseCreatorShares = computeDenomination(price / BigInt(2))

    //         if (balance < minimumBalanceRequired) {
    //             throw new ConflictException("Your account does not have sufficient balance to gift this course.")
    //         }

    //         await this.accountMySqlRepository.update(accountId, {balance : balance - minimumBalanceRequired})
    //         await this.accountMySqlRepository.increment({accountId : creatorId}, "balance", courseCreatorShares)

    //         const enrollDate = new Date()
    //         const endDate = new Date(enrollDate)
    //         endDate.setMonth(endDate.getMonth() + duration)

    //         const { enrolledInfoId } = await this.enrolledInfoMySqlRepository.save({
    //             courseId,
    //             accountId: receiveAccount.accountId,
    //             enrolled: true,
    //             priceAtEnrolled: minimumBalanceRequired,
    //             endDate,
    //         })

    //         const progresses = sections.reduce((acc, section) => {
    //             section.lessons.forEach((lesson) => {
    //                 acc.push({
    //                     enrolledInfoId,
    //                     lessonId: lesson.lessonId
    //                 })
    //             })
    //             return acc
    //         }, [])

    //         await this.progressMySqlRepository.save(progresses)

    //         await queryRunner.commitTransaction()
    //         return {
    //             message: `Account with email ${receiveAccountEmail} have received and enrolled to course ${title}`
    //         }
    //     } catch (ex) {
    //         await queryRunner.rollbackTransaction()
    //         throw ex
    //     } finally {
    //         await queryRunner.release()
    //     }

    // }

    async createCourseReport(
        input: CreateCourseReportInput,
    ): Promise<CreateCourseReportOutput> {
        const { data, accountId } = input
        const { reportedCourseId, title, description } = data

        const reportedCourse = await this.courseMySqlRepository.findOneBy({
            courseId: reportedCourseId,
        })

        if (!reportedCourse || reportedCourse.isDeleted) {
            throw new NotFoundException(
                "Reported course is not found or has been deleted",
            )
        }

        const processing = await this.reportCourseMySqlRepository.find({
            where: {
                reportedCourseId,
            },
        })

        if (
            processing &&
      processing.some(
          (processing) =>
              processing.processStatus === ReportProcessStatus.Processing,
      )
        ) {
            throw new ConflictException(
                "You have reported this course before and it is processing. Try update your report instead.",
            )
        }

        const { reportCourseId } = await this.reportCourseMySqlRepository.save({
            reporterAccountId: accountId,
            reportedCourseId,
            title,
            description,
        })

        return {
            message: `A report to course ${reportedCourse.title} has been submitted.`,
            others: {
                reportCourseId,
            },
        }
    }

    async updateCourseReport(
        input: UpdateCourseReportInput,
    ): Promise<UpdateCourseReportOutput> {
        const { data, accountId } = input
        const { reportCourseId, title, description } = data

        const found = await this.reportCourseMySqlRepository.findOneBy({
            reportCourseId,
        })

        if (!found) {
            throw new NotFoundException("Post's report not found.")
        }

        if (found.processStatus !== ReportProcessStatus.Processing) {
            throw new ConflictException("This report has been resolved and closed.")
        }

        if (found.reporterAccountId !== accountId) {
            throw new ConflictException("You aren't the owner of this report.")
        }

        await this.reportCourseMySqlRepository.update(reportCourseId, {
            title,
            description,
        })

        return {
            message: "Your Report has been updated successfully",
            others: {
                reportCourseId,
            },
        }
    }

    async resolveCourseReport(
        input: ResolveCourseReportInput,
    ): Promise<ResolveCourseReportOutput> {
        const { data } = input
        const { reportCourseId, processNote, processStatus } = data

        const found = await this.reportCourseMySqlRepository.findOneBy({
            reportCourseId,
        })

        if (!found) {
            throw new NotFoundException("Report not found")
        }

        if (found.processStatus !== ReportProcessStatus.Processing) {
            throw new ConflictException("This report has already been resolved")
        }

        await this.reportCourseMySqlRepository.update(reportCourseId, {
            processStatus,
            processNote,
        })

        return {
            message: "Report successfully resolved and closed.",
        }
    }

    // async updateLessonVideoView(input : UpdateLessonVideoViewInput) : Promise<void> {

    // }
}
